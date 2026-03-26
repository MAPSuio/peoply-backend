import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { Request } from "express";

/**
 * Throttler guard that uses CF-Connecting-IP when behind Cloudflare,
 * falling back to req.ip (which uses X-Forwarded-For via trust proxy).
 */
@Injectable()
export class CfThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Request): Promise<string> {
    const cfIp = req.headers["cf-connecting-ip"];
    if (cfIp) return Array.isArray(cfIp) ? cfIp[0] : cfIp;
    return req.ip ?? "unknown";
  }
}
