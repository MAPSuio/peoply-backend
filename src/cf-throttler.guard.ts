import { createHash } from "node:crypto";
import { ExecutionContext, Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { Request } from "express";
import { WHOLE_APP_THROTTLER } from "./rate-limit";
import { resolveClientIp } from "./util/client-ip";

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
    if (name !== WHOLE_APP_THROTTLER) {
      return super.generateKey(context, suffix, name);
    }

    return createHash("sha256").update(`${name}-${suffix}`).digest("hex");
  }
}
