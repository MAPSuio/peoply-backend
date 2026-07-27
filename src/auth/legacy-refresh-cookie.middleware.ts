import { Injectable, NestMiddleware } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";
import { AuthService } from "./auth.service";

/**
 * Expires the legacy `refresh` cookie (path "/auth/refresh", written by
 * production until 2026-03-23) on every response from the refresh endpoint
 * and the login callbacks.
 *
 * It runs as middleware — not in the controller — because the users hit by
 * the legacy cookie never reach the controller: the stale token shadows the
 * valid one, RefreshGuard rejects the request, and the response goes out as
 * a 401. Headers queued here are still on that 401, so one failed refresh
 * (or one re-login through a callback) heals the browser for good.
 */
@Injectable()
export class LegacyRefreshCookieMiddleware implements NestMiddleware {
  constructor(private readonly authService: AuthService) {}

  use(_req: Request, res: Response, next: NextFunction) {
    res.clearCookie(
      "refresh",
      this.authService.getLegacyRefreshCookieClearOptions(),
    );
    next();
  }
}
