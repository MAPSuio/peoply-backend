import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * The part of a Prisma model delegate this service uses. Structural rather
 * than a union of the five concrete delegates, so adding a sixth counter does
 * not mean touching a type as well.
 */
interface CountableByCreatedAt {
  count(args: { where: { createdAt: { gte: Date } } }): Promise<number>;
}

@Injectable()
export class ModerationService {
  constructor(private readonly prisma: PrismaService) {}

  /** Rows created within the last `days` days, counted at call time. */
  private countCreatedWithin(model: CountableByCreatedAt, days: number) {
    return model.count({
      where: {
        createdAt: { gte: new Date(Date.now() - days * MILLISECONDS_PER_DAY) },
      },
    });
  }

  async getNumberOfNewUsers(days: number) {
    return await this.countCreatedWithin(this.prisma.user, days);
  }

  async getNumberOfNewEvents(days: number) {
    return await this.countCreatedWithin(this.prisma.event, days);
  }

  async getNumberOfNewOrgs(days: number) {
    return await this.countCreatedWithin(this.prisma.organization, days);
  }

  async getNumberOfNewRegistrations(days: number) {
    return await this.countCreatedWithin(this.prisma.registration, days);
  }

  async getNumberOfNewFavorites(days: number) {
    return await this.countCreatedWithin(this.prisma.favorite, days);
  }
}
