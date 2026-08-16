import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/** The models the moderation counters may count over. */
export type CountableModel =
  | "user"
  | "event"
  | "organization"
  | "registration"
  | "favorite";

/**
 * The part of a Prisma model delegate this service uses. Structural because
 * the union of the five concrete delegates' `count` signatures is not
 * callable as one.
 */
interface CountableByCreatedAt {
  count(args: { where: { createdAt: { gte: Date } } }): Promise<number>;
}

@Injectable()
export class ModerationService {
  constructor(private readonly prisma: PrismaService) {}

  /** Rows created within the last `days` days, counted at call time. */
  countCreatedWithin(model: CountableModel, days: number) {
    const delegate: CountableByCreatedAt = this.prisma[model];
    return delegate.count({
      where: {
        createdAt: { gte: new Date(Date.now() - days * MILLISECONDS_PER_DAY) },
      },
    });
  }
}
