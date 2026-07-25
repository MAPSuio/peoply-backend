import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ModerationService {
  constructor(private readonly prisma: PrismaService) {}

  async getNumberOfNewUsers(days: number) {
    const newUsers = await this.prisma.user.count({
      where: {
        createdAt: {
          gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
        },
      },
    });
    return newUsers;
  }

  async getNumberOfNewEvents(days: number) {
    const newEvents = await this.prisma.event.count({
      where: {
        createdAt: {
          gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
        },
      },
    });
    return newEvents;
  }

  async getNumberOfNewOrgs(days: number) {
    const newOrgs = await this.prisma.organization.count({
      where: {
        createdAt: {
          gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
        },
      },
    });
    return newOrgs;
  }

  async getNumberOfNewRegistrations(days: number) {
    const newRegistrations = await this.prisma.registration.count({
      where: {
        createdAt: {
          gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
        },
      },
    });
    return newRegistrations;
  }

  async getNumberOfNewFavorites(days: number) {
    const newFavorites = await this.prisma.favorite.count({
      where: {
        createdAt: {
          gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
        },
      },
    });
    return newFavorites;
  }
}
