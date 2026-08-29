import { Injectable, NestMiddleware } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";
import { AuthService } from "./auth.service";
import {
  SESSION_MARKER_COOKIE_NAME,
  SESSION_MARKER_COOKIE_VALUE,
} from "./session-marker-cookie-name";

/**
 * Hands the session marker to browsers whose session was issued before the
 * marker existed. Without it the frontend, which skips its auth bootstrap when
 * the marker is missing, would treat every session already in the wild as
 * logged out.
 */
@Injectable()
export class SessionMarkerBackfillMiddleware implements NestMiddleware {
  constructor(private readonly authService: AuthService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const cookies = req.cookies ?? {};
    const hasSession = Boolean(cookies.access || cookies.refresh);
    const hasMarker = Boolean(cookies[SESSION_MARKER_COOKIE_NAME]);

    if (hasSession && !hasMarker) {
      res.cookie(
        SESSION_MARKER_COOKIE_NAME,
        SESSION_MARKER_COOKIE_VALUE,
        this.authService.getSessionMarkerCookieOptions(),
      );
    }

    next();
  }
}
