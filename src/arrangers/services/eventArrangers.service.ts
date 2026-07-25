import { Injectable } from "@nestjs/common";
import { EventVisibility, OrganizationRole } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { PUBLIC_USER_SELECT } from "../../users/user.select";

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

  //find all events arranged by a given arrangerID
  async findAllWithEvents(arrangerId: string) {
    return await this.prismaService.eventArranger.findMany({
      where: {
        arrangerId,
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
  }

  async findAllPublicWithEvents(arrangerId: string) {
    return await this.prismaService.eventArranger.findMany({
      where: {
        arrangerId,
        event: {
          is: {
            archivedAt: null,
            visibility: EventVisibility.PUBLIC,
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
                  include: {
                    user: {
                      select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        image: true,
                      },
                    },
                    organization: {
                      select: {
                        id: true,
                        urlId: true,
                        name: true,
                        image: true,
                        orgNr: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  async findAllWithEventsArrangedByUserAndOrganizationsOfUser(userId: string) {
    const orgs = await this.prismaService.organization.findMany({
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
