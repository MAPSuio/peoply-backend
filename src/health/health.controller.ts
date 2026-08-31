import { Controller, Get, HttpStatus, Res } from "@nestjs/common";
import { SkipRateLimit } from "../rate-limit";
import { Response } from "express";
import { HealthService } from "./health.service";

/**
 * Two probes, deliberately answering two different questions.
 *
 * `/_health` says the process is up and routing works. It touches nothing, so
 * it can never fail for a reason outside this process.
 *
 * `/readiness` says the application can actually serve traffic, which means
 * reaching the database. This is the one that matters: the driver connects
 * lazily, so an instance whose database configuration is broken still boots,
 * still listens, and still passes a TCP check — it just answers 500 to every
 * request that touches data. That is the outage this endpoint exists to make
 * visible.
 *
 * Both skip the rate limiter. A throttled probe returns 429 under load, the
 * platform reads that as unhealthy, and it restarts an instance that was
 * fine — turning a traffic spike into an outage. Database load is bounded by
 * the cache in HealthService instead, which holds regardless of source IP.
 */
@SkipRateLimit()
@Controller()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get("_health")
  liveness() {
    return { status: "ok" };
  }

  @Get("readiness")
  async readiness(@Res({ passthrough: true }) res: Response) {
    const { ready, checks } = await this.health.check();

    res.status(ready ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return { status: ready ? "ready" : "not_ready", checks };
  }
}
