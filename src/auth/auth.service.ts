import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { User } from "../generated/prisma/client";
import { CookieOptions } from "express";
import { extractRequestOrigin, parseTrustedOrigins } from "./auth-origin";
import { getTokenExpirySeconds } from "./token-expiry";

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  private isLocalAuthEnabled() {
    return (
      this.configService.get<boolean>("LOCAL_AUTH_ENABLED") === true &&
      process.env.NODE_ENV !== "production"
    );
  }

  private baseCookieOptions(): {
    sameSite: "none" | "lax";
    httpOnly: boolean;
    secure: boolean;
  } {
    return this.isLocalAuthEnabled()
      ? {
          sameSite: "lax",
          httpOnly: true,
          secure: false,
        }
      : {
          sameSite: "none",
          httpOnly: true,
          secure: true,
        };
  }

  validateJWT(token: string) {
    return this.jwtService.verify(token);
  }

  /**
   * Same verification as `validateJWT`, but for callers that cannot treat a
   * bad token as "anonymous".
   *
   * The interceptors wrap `validateJWT` in a try/catch and fall back to
   * `req.user = undefined`; the guards called it bare, so a missing, expired
   * or malformed cookie escaped as a jsonwebtoken error and the client got a
   * 500 instead of a 401. Today `AuthenticatedGuard` always runs first and
   * shields them, which makes this defence in depth rather than a live bug -
   * but nothing enforces that ordering, and a guard used on its own would
   * regress it silently.
   */
  requireValidAccessToken(token: string | undefined) {
    if (!token) {
      throw new UnauthorizedException();
    }

    try {
      return this.validateJWT(token);
    } catch {
      throw new UnauthorizedException();
    }
  }

  validateRefreshJWT(token: string) {
    return this.jwtService.verify(token, {
      secret: this.configService.get<string>("JWT_REFRESH_TOKEN_SECRET"),
    });
  }

  getAccessToken(user: User) {
    const payload = { sub: user.id };
    return this.jwtService.sign(payload); // configured in AuthModule
  }

  getRefreshToken(user: { id: string; refreshTokenId?: string | null }) {
    const payload = { sub: user.id, tokenId: user.refreshTokenId };
    return this.jwtService.sign(payload, {
      secret: this.configService.get<string>("JWT_REFRESH_TOKEN_SECRET"),
      expiresIn: getTokenExpirySeconds(
        this.configService,
        "JWT_REFRESH_TOKEN_EXP_TIME",
      ),
    });
  }

  getAccessCookieOptions(): CookieOptions {
    return {
      ...this.baseCookieOptions(),
      maxAge:
        this.configService.get<number>("JWT_ACCESS_TOKEN_EXP_TIME", {
          infer: true,
        }) * 1000,
    };
  }

  getRefreshCookieOptions(): CookieOptions {
    return {
      ...this.baseCookieOptions(),
      maxAge:
        this.configService.get<number>("JWT_REFRESH_TOKEN_EXP_TIME", {
          infer: true,
        }) * 1000,
      path: "/auth",
    };
  }

  /**
   * Options for clearing the refresh cookie that production wrote with
   * `path: "/auth/refresh"` until 2026-03-23 (PR #295 moved it to "/auth").
   *
   * Browsers that still hold that cookie send it to /auth/refresh listed
   * before the current one (RFC 6265 §5.4 orders longer paths first), and
   * cookie-parser keeps only the first duplicate — so a long-expired legacy
   * token shadows the valid one and every refresh 401s until the user's
   * session dies. Deleting a cookie requires matching name + path, hence
   * these dedicated options. Safe to remove once the legacy cookies are
   * definitively gone (they stopped being written 2026-03-23 and carried a
   * finite Max-Age).
   */
  getLegacyRefreshCookieClearOptions(): CookieOptions {
    return {
      ...this.baseCookieOptions(),
      path: "/auth/refresh",
    };
  }

  assertTrustedOrigin(
    headers: { origin?: string; referer?: string },
    options?: { allowMissingOrigin?: boolean },
  ) {
    const trustedOrigins = parseTrustedOrigins(
      this.configService.get<string>("CORS_ORIGIN"),
    );

    if (!trustedOrigins.length) {
      throw new Error("CORS_ORIGIN not configured");
    }

    const requestOrigin = extractRequestOrigin(headers);

    if (!requestOrigin && options?.allowMissingOrigin) {
      return;
    }

    if (!requestOrigin || !trustedOrigins.includes(requestOrigin)) {
      throw new ForbiddenException("Untrusted origin");
    }
  }
}
