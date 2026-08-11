import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { Request } from "express";
import { resolveClientIp } from "./util/client-ip";

/**
 * Throttler guard keyed on the caller's IP.
 *
 * `CF-Connecting-IP` is only honoured when the request can be shown to have
 * come through Cloudflare; otherwise the proxy-derived `req.ip` is used. See
 * `util/client-ip.ts` — trusting the header unconditionally let anything that
 * reached the origin directly rotate it and skip rate limiting entirely.
 */
@Injectable()
export class CfThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Request): Promise<string> {
    return resolveClientIp(req);
  }
}
