import { createHash } from "node:crypto";
import { ExecutionContext, Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { THROTTLER_LIMIT } from "@nestjs/throttler/dist/throttler.constants";
import { Request } from "express";
import { resolveClientIp } from "./util/client-ip";

const SHARED_ALLOWANCE = "shared";

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
    const declaresOwnLimit = this.reflector.getAllAndOverride<
      number | undefined
    >(THROTTLER_LIMIT + name, [context.getHandler(), context.getClass()]);

    if (declaresOwnLimit === undefined) return SHARED_ALLOWANCE;

    return `${context.getClass().name}-${context.getHandler().name}`;
  }
}
