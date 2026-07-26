import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  EventArrangerRole,
  EventRegistrationMode,
  EventSource,
  EventVisibility,
  IcsFeedSyncStatus,
  OrganizationRole,
  OrganizationIcsFeed,
} from "../generated/prisma/client";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { OrganizationsService } from "../organizations/organizations.service";
import { AzureCommunicationService } from "../azure/azure-communication.service";
import { IcsFetchService } from "./ics-fetch.service";
import { IcsParserService, ParsedIcsEvent } from "./ics-parser.service";
import { UpsertOrganizationIcsFeedDto } from "./dto/upsert-organization-ics-feed.dto";
import { createUuid } from "../util/uuid";

const DEFAULT_SYNC_INTERVAL_MINUTES = 60;
const LOCK_TTL_MS = 30 * 60 * 1000;
const DISABLE_AFTER_FAILURE_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class IcsFeedsService {
  private readonly logger = new Logger(IcsFeedsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly organizationsService: OrganizationsService,
    private readonly azureCommunicationService: AzureCommunicationService,
    private readonly icsFetchService: IcsFetchService,
    private readonly icsParserService: IcsParserService,
  ) {}

  async getOrganizationFeed(orgId: string) {
    return this.prisma.organizationIcsFeed.findUnique({
      where: { organizationId: orgId },
    });
  }

  async upsertOrganizationFeed(
    orgId: string,
    dto: UpsertOrganizationIcsFeedDto,
  ) {
    await this.ensureOrganizationExists(orgId);

    const fetchedCalendar = await this.icsFetchService.fetchCalendar(dto.url);
    this.icsParserService.parse(fetchedCalendar.body);

    const feed = await this.prisma.organizationIcsFeed.upsert({
      where: { organizationId: orgId },
      create: {
        organizationId: orgId,
        url: fetchedCalendar.url,
        syncIntervalMinutes:
          dto.syncIntervalMinutes ?? DEFAULT_SYNC_INTERVAL_MINUTES,
        registrationMode:
          dto.registrationMode ?? EventRegistrationMode.EXTERNAL,
        enabled: true,
        disabledAt: null,
        lastSyncError: null,
        consecutiveFailures: 0,
      },
      update: {
        url: fetchedCalendar.url,
        syncIntervalMinutes:
          dto.syncIntervalMinutes ?? DEFAULT_SYNC_INTERVAL_MINUTES,
        registrationMode:
          dto.registrationMode ?? EventRegistrationMode.EXTERNAL,
        enabled: true,
        disabledAt: null,
        lastSyncError: null,
      },
    });

    await this.syncFeedById(feed.id, fetchedCalendar.body);
    return this.getOrganizationFeed(orgId);
  }

  async deleteOrganizationFeed(orgId: string) {
    const feed = await this.prisma.organizationIcsFeed.findUnique({
      where: { organizationId: orgId },
    });

    if (!feed) {
      throw new NotFoundException("Organization ICS feed was not found");
    }

    return this.prisma.organizationIcsFeed.delete({
      where: { organizationId: orgId },
    });
  }

  async syncOrganizationFeed(orgId: string) {
    const feed = await this.prisma.organizationIcsFeed.findUnique({
      where: { organizationId: orgId },
    });

    if (!feed) {
      throw new NotFoundException("Organization ICS feed was not found");
    }

    return this.syncFeedById(feed.id);
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async syncDueFeeds() {
    const feeds = await this.prisma.organizationIcsFeed.findMany({
      where: { enabled: true },
    });

    await Promise.all(
      feeds
        .filter((feed: OrganizationIcsFeed) => this.isDue(feed))
        .map((feed: OrganizationIcsFeed) => this.syncFeedById(feed.id)),
    );
  }

  private async syncFeedById(feedId: string, prefetchedBody?: string) {
    const lockAcquired = await this.acquireLock(feedId);
    if (!lockAcquired) {
      return this.prisma.organizationIcsFeed.findUnique({
        where: { id: feedId },
      });
    }

    const feed = await this.prisma.organizationIcsFeed.findUnique({
      where: { id: feedId },
      include: {
        organization: true,
      },
    });

    if (!feed) {
      await this.releaseLock(feedId);
      throw new NotFoundException("Organization ICS feed was not found");
    }

    try {
      const calendarBody =
        prefetchedBody ??
        (await this.icsFetchService.fetchCalendar(feed.url)).body;
      const parsedEvents = this.icsParserService.parse(calendarBody);

      await this.upsertImportedEvents(feed, parsedEvents);

      await this.prisma.organizationIcsFeed.update({
        where: { id: feed.id },
        data: {
          lastSyncedAt: new Date(),
          lastSuccessfulSyncAt: new Date(),
          lastSyncStatus: IcsFeedSyncStatus.SUCCESS,
          lastSyncError: null,
          consecutiveFailures: 0,
          enabled: true,
          disabledAt: null,
          syncStartedAt: null,
        },
      });
    } catch (error) {
      const updatedFeed = await this.prisma.organizationIcsFeed.update({
        where: { id: feed.id },
        data: {
          lastSyncedAt: new Date(),
          lastSyncStatus: IcsFeedSyncStatus.FAILED,
          lastSyncError:
            error instanceof Error ? error.message : "Unknown ICS sync failure",
          consecutiveFailures: {
            increment: 1,
          },
          syncStartedAt: null,
        },
      });

      if (updatedFeed.consecutiveFailures === 3) {
        await this.notifyOrganizationAdmins(
          feed.organizationId,
          "Peoply: ICS-synkronisering feiler",
          this.buildFailureEmail(
            feed.organization.name,
            updatedFeed.lastSyncError,
          ),
        );
      }

      const lastHealthyAt =
        updatedFeed.lastSuccessfulSyncAt?.getTime() ??
        updatedFeed.createdAt.getTime();
      if (Date.now() - lastHealthyAt >= DISABLE_AFTER_FAILURE_MS) {
        await this.prisma.organizationIcsFeed.update({
          where: { id: feed.id },
          data: {
            enabled: false,
            disabledAt: new Date(),
            lastSyncStatus: IcsFeedSyncStatus.DISABLED,
            syncStartedAt: null,
          },
        });

        await this.notifyOrganizationAdmins(
          feed.organizationId,
          "Peoply: ICS-integrasjon deaktivert",
          this.buildDisabledEmail(feed.organization.name),
        );
      }

      this.logger.error(
        `ICS sync failed for organization ${feed.organizationId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return this.prisma.organizationIcsFeed.findUnique({
      where: { id: feed.id },
    });
  }

  private async upsertImportedEvents(
    feed: OrganizationIcsFeed & {
      organization: {
        id: string;
        arrangerId: string;
        name: string;
      };
    },
    parsedEvents: ParsedIcsEvent[],
  ) {
    const externalIds = parsedEvents.map((event) => event.externalId);

    for (const parsedEvent of parsedEvents) {
      await this.prisma.event.upsert({
        where: {
          organizationIcsFeedId_externalId: {
            organizationIcsFeedId: feed.id,
            externalId: parsedEvent.externalId,
          },
        },
        create: {
          id: createUuid(),
          urlId: await this.generateUniqueUrlId(),
          title: parsedEvent.title,
          description: parsedEvent.description,
          startDate: parsedEvent.startDate,
          endDate: parsedEvent.endDate,
          locationName: parsedEvent.locationName,
          visibility: EventVisibility.PUBLIC,
          hasFood: false,
          source: EventSource.ICS,
          registrationMode: feed.registrationMode,
          readOnly: true,
          externalId: parsedEvent.externalId,
          externalUrl: parsedEvent.externalUrl,
          externalUpdatedAt: parsedEvent.externalUpdatedAt,
          organizationIcsFeedId: feed.id,
          eventArrangers: {
            create: {
              arrangerId: feed.organization.arrangerId,
              role: EventArrangerRole.ADMIN,
            },
          },
        },
        update: {
          title: parsedEvent.title,
          description: parsedEvent.description,
          startDate: parsedEvent.startDate,
          endDate: parsedEvent.endDate,
          locationName: parsedEvent.locationName,
          visibility: EventVisibility.PUBLIC,
          source: EventSource.ICS,
          registrationMode: feed.registrationMode,
          readOnly: true,
          externalUrl: parsedEvent.externalUrl,
          externalUpdatedAt: parsedEvent.externalUpdatedAt,
          archivedAt: null,
        },
      });
    }

    await this.prisma.event.updateMany({
      where: {
        organizationIcsFeedId: feed.id,
        archivedAt: null,
        ...(externalIds.length > 0
          ? {
              externalId: {
                notIn: externalIds,
              },
            }
          : {}),
      },
      data: {
        archivedAt: new Date(),
      },
    });
  }

  private isDue(feed: OrganizationIcsFeed) {
    if (!feed.lastSyncedAt) {
      return true;
    }

    const nextRunAt =
      feed.lastSyncedAt.getTime() + feed.syncIntervalMinutes * 60 * 1000;
    return nextRunAt <= Date.now();
  }

  private async acquireLock(feedId: string) {
    const staleLockDate = new Date(Date.now() - LOCK_TTL_MS);
    const result = await this.prisma.organizationIcsFeed.updateMany({
      where: {
        id: feedId,
        OR: [{ syncStartedAt: null }, { syncStartedAt: { lt: staleLockDate } }],
      },
      data: {
        syncStartedAt: new Date(),
        lastSyncStatus: IcsFeedSyncStatus.RUNNING,
      },
    });

    return result.count === 1;
  }

  private async releaseLock(feedId: string) {
    await this.prisma.organizationIcsFeed.update({
      where: { id: feedId },
      data: { syncStartedAt: null },
    });
  }

  private async ensureOrganizationExists(orgId: string) {
    const organization = await this.organizationsService.findOne(orgId);
    if (!organization) {
      throw new NotFoundException("Organization was not found");
    }
  }

  private async generateUniqueUrlId() {
    let urlId = "";
    let existingEvent = null;
    let attempts = 0;

    do {
      urlId = this.generateUrlId();
      existingEvent = await this.prisma.event.findUnique({ where: { urlId } });
      attempts += 1;
    } while (existingEvent && attempts < 5);

    if (existingEvent) {
      throw new BadRequestException("Could not generate a unique event urlId");
    }

    return urlId;
  }

  private generateUrlId() {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let urlId = "";

    for (let index = 0; index < 8; index += 1) {
      urlId += letters.charAt(Math.floor(Math.random() * letters.length));
    }

    return urlId;
  }

  private async notifyOrganizationAdmins(
    organizationId: string,
    subject: string,
    html: string,
  ) {
    const recipients = await this.prisma.userOrganizationRole.findMany({
      where: {
        organizationId,
        role: {
          in: [OrganizationRole.ADMIN, OrganizationRole.OWNER],
        },
      },
      include: {
        user: {
          select: {
            email: true,
          },
        },
      },
    });

    const emails = recipients
      .map(({ user }: { user: { email: string } }) => user.email)
      .filter(
        (email: string, index: number, values: string[]) =>
          values.indexOf(email) === index,
      );

    if (!emails.length) {
      return;
    }

    await this.azureCommunicationService.send({
      sender: "no-reply@peoply.app",
      recipients: {
        to: [{ email: "no-reply@peoply.app" }],
        bCC: emails.map((email: string) => ({ email })),
      },
      content: {
        subject,
        html,
      },
    });
  }

  private buildFailureEmail(organizationName: string, error?: string | null) {
    return (
      `<h1>ICS-synkronisering feiler for ${organizationName}</h1>` +
      `<p>Peoply har feilet tre ganger på rad ved import av organisasjonens ICS-kalender.</p>` +
      `<p>Siste feil: ${error ?? "Ukjent feil"}</p>`
    );
  }

  private buildDisabledEmail(organizationName: string) {
    return (
      `<h1>ICS-integrasjonen for ${organizationName} er deaktivert</h1>` +
      `<p>Peoply har ikke klart å synkronisere kalenderen på syv dager, og integrasjonen er derfor deaktivert.</p>` +
      `<p>Oppdater URL-en eller trigge en ny synkronisering fra organisasjonens innstillinger for å aktivere den igjen.</p>`
    );
  }
}
