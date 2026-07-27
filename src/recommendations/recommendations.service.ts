import { Injectable } from "@nestjs/common";
import { PUBLIC_ARRANGER_INCLUDE } from "../arrangers/arranger.select";
import { EventVisibility, RegStatus } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Content-based recommendations.
 *
 * A logged-in user's taste profile is built from three signals — GOING
 * registrations, favorites and followed arrangers — turned into per-category
 * and per-arranger affinity weights. Candidates are scored by how much of
 * that affinity they hit, plus a weak popularity prior (log-scaled so a
 * single huge event cannot drown out taste matches) that doubles as the
 * complete ranking for anonymous visitors and users with no history yet.
 */

/* Signal weights: attending is a stronger signal than favoriting; an
 * explicit follow is the strongest statement about an arranger. */
const WEIGHT_GOING = 3;
const WEIGHT_FAVORITE = 2;
const WEIGHT_FOLLOW = 5;
const WEIGHT_POPULARITY = 0.5;
const WEIGHT_FEATURED = 1;

/* Bounds so one request never scans unbounded history or candidate sets. */
const HISTORY_POOL_SIZE = 200;
const CANDIDATE_POOL_SIZE = 200;
const ORG_EVENT_SAMPLE_SIZE = 30;

const DEFAULT_TAKE = 10;

interface TasteProfile {
  categoryAffinity: Map<number, number>;
  arrangerAffinity: Map<string, number>;
  /** Events the user already registered for or favorited. */
  knownEventIds: Set<string>;
  /** Arrangers the user follows or whose organization they are a member of. */
  knownArrangerIds: Set<string>;
}

interface EventSignal {
  eventCategories: { categoryId: number }[];
  eventArrangers: { arrangerId: string }[];
}

@Injectable()
export class RecommendationsService {
  constructor(private prisma: PrismaService) {}

  async recommendEvents(userId?: string, take = DEFAULT_TAKE) {
    const [profile, candidates] = await Promise.all([
      this.buildTasteProfile(userId),
      this.prisma.event.findMany({
        take: CANDIDATE_POOL_SIZE,
        where: {
          startDate: { gte: new Date() },
          archivedAt: null,
          visibility: EventVisibility.PUBLIC,
          eventArrangers: {
            none: { arranger: { organization: { is: { approved: false } } } },
          },
        },
        include: {
          eventArrangers: {
            include: { arranger: { include: PUBLIC_ARRANGER_INCLUDE } },
          },
          eventCategories: {
            select: { categoryId: true, category: { select: { name: true } } },
          },
          _count: { select: { registrations: true } },
        },
        orderBy: { startDate: "asc" },
      }),
    ]);

    return candidates
      .filter((event) => !profile.knownEventIds.has(event.id))
      .map((event) => {
        const affinity =
          this.sumAffinity(
            profile.categoryAffinity,
            event.eventCategories.map((ec) => ec.categoryId),
          ) +
          this.sumAffinity(
            profile.arrangerAffinity,
            event.eventArrangers.map((ea) => ea.arrangerId),
          );
        const prior =
          WEIGHT_POPULARITY * Math.log1p(event._count.registrations) +
          (event.featured ? WEIGHT_FEATURED : 0);
        return { event, score: affinity + prior };
      })
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.event.startDate.getTime() - b.event.startDate.getTime(),
      )
      .slice(0, take)
      .map(({ event: { _count, ...event } }) => event);
  }

  async recommendOrganizations(userId?: string, take = DEFAULT_TAKE) {
    const [profile, candidates] = await Promise.all([
      this.buildTasteProfile(userId),
      this.prisma.organization.findMany({
        take: CANDIDATE_POOL_SIZE,
        where: { approved: true },
        include: {
          arranger: {
            select: {
              _count: { select: { arrangerFollowers: true } },
              eventArrangers: {
                take: ORG_EVENT_SAMPLE_SIZE,
                orderBy: { createdAt: "desc" },
                select: {
                  event: {
                    select: {
                      archivedAt: true,
                      visibility: true,
                      eventCategories: { select: { categoryId: true } },
                    },
                  },
                },
              },
            },
          },
        },
      }),
    ]);

    return candidates
      .filter((org) => !profile.knownArrangerIds.has(org.arrangerId))
      .map(({ arranger, ...org }) => {
        const sampledEvents = arranger.eventArrangers
          .map((ea) => ea.event)
          .filter(
            (event) =>
              event.archivedAt === null &&
              event.visibility === EventVisibility.PUBLIC,
          );
        /* Mean per-event category overlap, so orgs with many events are not
         * favored over orgs whose events consistently match the user. */
        const categoryScore = sampledEvents.length
          ? sampledEvents
              .map((event) =>
                this.sumAffinity(
                  profile.categoryAffinity,
                  event.eventCategories.map((ec) => ec.categoryId),
                ),
              )
              .reduce((sum, overlap) => sum + overlap, 0) / sampledEvents.length
          : 0;
        const affinity =
          (profile.arrangerAffinity.get(org.arrangerId) ?? 0) + categoryScore;
        const prior =
          WEIGHT_POPULARITY * Math.log1p(arranger._count.arrangerFollowers);
        return { org, score: affinity + prior };
      })
      .sort((a, b) => b.score - a.score || a.org.name.localeCompare(b.org.name))
      .slice(0, take)
      .map(({ org }) => org);
  }

  private async buildTasteProfile(userId?: string): Promise<TasteProfile> {
    const profile: TasteProfile = {
      categoryAffinity: new Map(),
      arrangerAffinity: new Map(),
      knownEventIds: new Set(),
      knownArrangerIds: new Set(),
    };
    if (!userId) {
      return profile;
    }

    const eventSignalSelect = {
      eventCategories: { select: { categoryId: true } },
      eventArrangers: { select: { arrangerId: true } },
    } as const;

    const [registrations, favorites, follows, memberships] = await Promise.all([
      this.prisma.registration.findMany({
        take: HISTORY_POOL_SIZE,
        where: { userId },
        select: {
          eventId: true,
          regStatus: true,
          event: { select: eventSignalSelect },
        },
        orderBy: { updatedAt: "desc" },
      }),
      this.prisma.favorite.findMany({
        take: HISTORY_POOL_SIZE,
        where: { userId },
        select: { eventId: true, event: { select: eventSignalSelect } },
        orderBy: { updatedAt: "desc" },
      }),
      this.prisma.arrangerFollower.findMany({
        where: { userId },
        select: { arrangerId: true },
      }),
      this.prisma.userOrganizationRole.findMany({
        where: { userId },
        select: { organization: { select: { arrangerId: true } } },
      }),
    ]);

    for (const registration of registrations) {
      profile.knownEventIds.add(registration.eventId);
      if (registration.regStatus === RegStatus.GOING) {
        this.addEventSignal(profile, registration.event, WEIGHT_GOING);
      }
    }
    for (const favorite of favorites) {
      profile.knownEventIds.add(favorite.eventId);
      this.addEventSignal(profile, favorite.event, WEIGHT_FAVORITE);
    }
    for (const follow of follows) {
      profile.knownArrangerIds.add(follow.arrangerId);
      this.bumpAffinity(
        profile.arrangerAffinity,
        follow.arrangerId,
        WEIGHT_FOLLOW,
      );
    }
    for (const membership of memberships) {
      profile.knownArrangerIds.add(membership.organization.arrangerId);
    }

    return profile;
  }

  private addEventSignal(
    profile: TasteProfile,
    event: EventSignal,
    weight: number,
  ) {
    for (const { categoryId } of event.eventCategories) {
      this.bumpAffinity(profile.categoryAffinity, categoryId, weight);
    }
    for (const { arrangerId } of event.eventArrangers) {
      this.bumpAffinity(profile.arrangerAffinity, arrangerId, weight);
    }
  }

  private bumpAffinity<K>(affinity: Map<K, number>, key: K, weight: number) {
    affinity.set(key, (affinity.get(key) ?? 0) + weight);
  }

  private sumAffinity<K>(affinity: Map<K, number>, keys: K[]) {
    return keys.reduce((sum, key) => sum + (affinity.get(key) ?? 0), 0);
  }
}
