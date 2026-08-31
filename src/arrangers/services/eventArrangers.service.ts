import { Injectable } from "@nestjs/common";
import {
  EventVisibility,
  OrganizationRole,
} from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { PUBLIC_USER_SELECT } from "../../users/user.select";
import { PUBLIC_ARRANGER_INCLUDE } from "../arranger.select";
import { ALL_ROWS, MAX_PAGE_SIZE, pageBoundsOf } from "../../util/pagination";
import { PaginationDto } from "../../util/pagination.dto";

export type PublicEventsOptions = {
  fromDate?: Date;
  take?: number;
};

/**
 * Every query here returns *all* arrangers of each matched event, not only the
 * arranger being asked about, so a co-arranged event exposes the other party.
 * `organization` is safe to include whole — the same row is served publicly by
 * `GET /organizations/:orgId` — but `user` must be narrowed.
 */
const ARRANGER_INCLUDE = {
  arranger: {
    include: {
      user: { select: PUBLIC_USER_SELECT },
      organization: true,
    },
  },
};

@Injectable()
export class EventArrangersService {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Backs two unauthenticated endpoints - the organization page and its ICS
   * calendar - so the row count is set by how many events an organization has
   * ever run, and grows forever. Bounded here rather than at the call sites so
   * neither can forget.
   *
   * @param fromDate keep only events starting at or after this instant.
   */
  async findAllPublicWithEvents(
    arrangerId: string,
    { fromDate, take = MAX_PAGE_SIZE }: PublicEventsOptions = {},
  ) {
    return await this.prismaService.eventArranger.findMany({
      where: {
        arrangerId,
        event: {
          is: {
            archivedAt: null,
            visibility: EventVisibility.PUBLIC,
            ...(fromDate ? { startDate: { gte: fromDate } } : {}),
            eventArrangers: {
              none: {
                arranger: {
                  organization: {
                    is: {
                      approved: false,
                    },
                  },
                },
              },
            },
          },
        },
      },
      include: {
        event: {
          include: {
            eventArrangers: {
              include: {
                arranger: {
                  include: PUBLIC_ARRANGER_INCLUDE,
                },
              },
            },
          },
        },
      },
      /* The cap only makes sense with a deterministic order, or which events
         survive it is up to the query planner. A caller that set a floor is
         looking forward from it, so keep the nearest ones; one that did not is
         showing a history, so keep the most recent. */
      orderBy: { event: { startDate: fromDate ? "asc" : "desc" } },
      take,
    });
  }

  async findAllWithEventsArrangedByUserAndOrganizationsOfUser(
    userId: string,
    page: PaginationDto = {},
  ) {
    const { skip, take } = pageBoundsOf(page);

    /* This set decides which events count as the caller's, so a truncated read
       of it silently drops whole organizations from the answer. It is the page
       of events below that is bounded, never this. */
    const orgs = await this.prismaService.organization.findMany({
      take: ALL_ROWS,
      where: {
        organizationRoles: {
          some: {
            role: {
              in: [OrganizationRole.ADMIN, OrganizationRole.OWNER],
            },
            user: {
              id: userId,
            },
          },
        },
      },
    });

    const myArrangerId = (
      await this.prismaService.user.findUnique({
        where: { id: userId },
      })
    )?.arrangerId;

    if (!myArrangerId) {
      throw new Error("User does not have an arrangerId");
    }

    const myArrangerIds = new Set([
      myArrangerId,
      ...orgs.map((org) => org.arrangerId),
    ]);

    const rows = await this.prismaService.eventArranger.findMany({
      skip,
      take,
      /* Newest first is what a "my events" list is read for, and the primary
         key breaks the tie: two events starting at the same instant are
         interchangeable to Postgres, so without it one of them can be served
         on two pages and its neighbour on none. */
      orderBy: [
        { event: { startDate: "desc" } },
        { eventId: "desc" },
        { arrangerId: "desc" },
      ],
      where: {
        arrangerId: {
          in: [...myArrangerIds],
        },
        event: {
          archivedAt: null,
        },
      },
      include: {
        event: {
          include: {
            eventArrangers: {
              include: ARRANGER_INCLUDE,
            },
          },
        },
      },
    });

    // The filter above selects events by *the caller's* arrangers, but the
    // nested include returns every arranger on those events. A co-arranged
    // event therefore carries organizations the caller has no role in, and
    // nothing in the payload said which was which — so a client reading this
    // as "my organizations" would ask for members of someone else's org and
    // get a 403. Mark them rather than dropping them: the co-arranger still
    // has to be rendered on the event.
    return rows.map((row) => ({
      ...row,
      event: {
        ...row.event,
        eventArrangers: row.event.eventArrangers.map((eventArranger) => ({
          ...eventArranger,
          isMine: myArrangerIds.has(eventArranger.arrangerId),
        })),
      },
    }));
  }
}
