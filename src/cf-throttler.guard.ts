import { createHash } from "node:crypto";
import { ExecutionContext, Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import {
  THROTTLER_BLOCK_DURATION,
  THROTTLER_KEY_GENERATOR,
  THROTTLER_LIMIT,
  THROTTLER_TRACKER,
  THROTTLER_TTL,
} from "@nestjs/throttler/dist/throttler.constants";
import { Request } from "express";
import { resolveClientIp } from "./util/client-ip";

const SHARED_ALLOWANCE = "shared";

const ROUTE_LEVEL_KEYS = [
  THROTTLER_LIMIT,
  THROTTLER_TTL,
  THROTTLER_BLOCK_DURATION,
  THROTTLER_TRACKER,
  THROTTLER_KEY_GENERATOR,
];

@Injectable()
export class CfThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Request): Promise<string> {
    return resolveClientIp(req);
  }

  protected generateKey(
    context: ExecutionContext,
    suffix: string,
    name: string,
  ): string {
    return createHash("sha256")
      .update(`${this.allowanceFor(context, name)}-${name}-${suffix}`)
      .digest("hex");
  }

  private allowanceFor(context: ExecutionContext, name: string) {
    const targets = [context.getHandler(), context.getClass()];
    const declaresOwnTerms = ROUTE_LEVEL_KEYS.some(
      (key) =>
        this.reflector.getAllAndOverride(key + name, targets) !== undefined,
    );

    if (!declaresOwnTerms) return SHARED_ALLOWANCE;

    return `${context.getClass().name}-${context.getHandler().name}`;
  }
}
