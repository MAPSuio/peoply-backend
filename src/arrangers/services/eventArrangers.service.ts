import { Injectable } from "@nestjs/common";
import { OrganizationRole } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class EventArrangersService {
  constructor(private readonly prismaService: PrismaService) {}

  //find all events arranged by a given arrangerID
  async findAllWithEvents(arrangerId: string) {
    return await this.prismaService.eventArranger.findMany({
      where: { arrangerId },
      include: {
        event: {
          include: {
            eventArrangers: {
              include: {
                arranger: {
                  include: {
                    user: true,
                    organization: true,
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

    const arrangerIds = [myArrangerId, ...orgs.map((org) => org.arrangerId)];

    return await this.prismaService.eventArranger.findMany({
      where: {
        arrangerId: {
          in: arrangerIds,
        },
      },
      include: {
        event: {
          include: {
            eventArrangers: {
              include: {
                arranger: {
                  include: {
                    user: true,
                    organization: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }
}
