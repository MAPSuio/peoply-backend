import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/**
 * How long the database probe may take before it counts as a failure. Kept
 * well under the platform's own health-check timeout so the endpoint answers
 * with a 503 rather than hanging until the probe gives up on us — a timeout
 * looks the same as a crash from the outside, but only one of them tells us
 * which dependency is broken.
 */
const DATABASE_TIMEOUT_MS = 2000;

/**
 * How long a probe result is reused. Readiness is unauthenticated, so without
 * this every request would be a free database query. The cache turns any
 * volume of traffic into at most one query per interval.
 */
const CACHE_TTL_MS = 2000;

export type ReadinessResult = {
  ready: boolean;
  checks: { database: "up" | "down" };
};

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private cached: { at: number; result: ReadinessResult } | null = null;
  private inFlight: Promise<ReadinessResult> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<ReadinessResult> {
    if (this.cached && Date.now() - this.cached.at < CACHE_TTL_MS) {
      return this.cached.result;
    }

    // A burst that arrives on a cold cache would otherwise open one database
    // query per request — exactly when the database is least able to take
    // them. Callers that arrive mid-probe share the one already running.
    if (!this.inFlight) {
      this.inFlight = this.probe().finally(() => {
        this.inFlight = null;
      });
    }

    return this.inFlight;
  }

  private async probe(): Promise<ReadinessResult> {
    const database = (await this.databaseReachable()) ? "up" : "down";
    const result: ReadinessResult = {
      ready: database === "up",
      checks: { database },
    };

    // Failures are cached too. A database that is down does not recover any
    // faster for being asked about on every request.
    this.cached = { at: Date.now(), result };
    return result;
  }

  private async databaseReachable(): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;

    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`Timed out after ${DATABASE_TIMEOUT_MS}ms`)),
            DATABASE_TIMEOUT_MS,
          );
        }),
      ]);
      return true;
    } catch (error) {
      // The reason is logged here and never returned to the caller: driver
      // errors name the database host and user, and this endpoint is public.
      this.logger.error(
        `Readiness probe failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
