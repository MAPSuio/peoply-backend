import { Injectable } from "@nestjs/common";
import { EventVisibility } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { EventNotFoundException } from "../events/exceptions";
import {
  EventAccessService,
  VIEW_GRANTING_REG_STATUSES,
} from "../event-access/event-access.service";
import { SearchFavoritesDto } from "./dto/search-favorites.dto";
import { eventCardInclude } from "../events/event.select";
import { DEFAULT_SEARCH_PAGE_SIZE } from "../util/pagination";

@Injectable()
export class FavoritesService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly eventAccess: EventAccessService,
  ) {}

  async create(userId: string, eventId: string) {
    /* findAll returns the whole event row when includeEvent=true, so a
     * favourite is a read handle on the event, not just a bookmark. Nothing
     * checked that the caller could see the event, which made favouriting a
     * private event a way to read it - including for a user the arranger had
     * banned, since a ban blocks re-registration but never blocked this. */
    const event = await this.prismaService.event.findUnique({
      where: { id: eventId },
      select: { visibility: true },
    });

    if (!event) {
      throw new EventNotFoundException(eventId);
    }

    if (event.visibility === EventVisibility.PRIVATE) {
      const registration = await this.prismaService.registration.findUnique({
        where: { eventId_userId: { eventId, userId } },
        select: { regStatus: true },
      });

      const mayView =
        registration !== null &&
        VIEW_GRANTING_REG_STATUSES.has(registration.regStatus);

      if (!mayView) {
        throw new EventNotFoundException(eventId);
      }
    }

    // P2002 (already favourited) -> 409 and P2003 (no such event or user)
    // -> 400, both handled by PrismaExceptionFilter.
    return this.prismaService.favorite.create({
      data: { eventId, userId },
    });
  }

  async findAll(searchProps: SearchFavoritesDto, userId: string) {
    const {
      skip = 0,
      take = DEFAULT_SEARCH_PAGE_SIZE,
      orderBy = "updatedAt",
      orderDirection = "asc",
    } = searchProps;

    const favorites = await this.prismaService.favorite.findMany({
      skip,
      take,
      where: {
        userId,
      },
      include: {
        event: eventCardInclude(searchProps),
      },
      orderBy: {
        [orderBy]: orderDirection,
      },
    });

    /* A favourite carries no status of its own, so it never expires the way a
       registration does - which made it the longer-lived of the two handles
       into an event the user can no longer see. Favouriting while INVITED and
       then being banned left this returning the full private event row.

       The favourite row stays; only the event payload goes. */
    const nonPublic = favorites.filter(
      (favorite) =>
        favorite.event &&
        (favorite.event as { visibility: EventVisibility }).visibility !==
          EventVisibility.PUBLIC,
    );

    if (nonPublic.length === 0) {
      return favorites;
    }

    const viewable = await this.eventAccess.viewableEventIds(
      userId,
      nonPublic.map(({ eventId }) => eventId),
    );

    for (const favorite of nonPublic) {
      if (!viewable.has(favorite.eventId)) {
        // @ts-expect-error the include is conditional, so the type is a union
        favorite.event = undefined;
      }
    }

    return favorites;
  }

  async findOne(userId: string, eventId: string) {
    return await this.prismaService.favorite.findUnique({
      where: {
        eventId_userId: { eventId, userId },
      },
    });
  }

  async remove(userId: string, eventId: string) {
    // The catch this replaces had no condition at all: every failure became
    // "favorite does not exist", so a dropped connection reported 404.
    return await this.prismaService.favorite.delete({
      where: {
        eventId_userId: {
          userId,
          eventId,
        },
      },
    });
  }
}
