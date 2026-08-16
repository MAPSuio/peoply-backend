import { ForbiddenException, Injectable } from "@nestjs/common";
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

  /**
   * Whether the deployment is *positively known* to be plaintext, read from
   * the origins we accept rather than from any feature flag.
   *
   * Deliberately phrased so that anything unclear - no origins configured, a
   * mix of schemes - counts as not plaintext and therefore keeps `Secure`.
   * Getting it wrong in that direction breaks a local login; getting it wrong
   * the other way makes real session cookies replayable over http.
   */
  private isPlaintextDeployment() {
    const origins = parseTrustedOrigins(
      this.configService.get<string>("CORS_ORIGIN"),
    );

    return (
      origins.length > 0 &&
      origins.every((origin) => origin.startsWith("http://"))
    );
  }

  private baseCookieOptions(): {
    sameSite: "none" | "lax";
    httpOnly: boolean;
    secure: boolean;
  } {
    /* The relaxed pair exists for `http://localhost`, where `Secure` would
       stop the cookie being stored at all. LOCAL_AUTH_ENABLED alone did not
       establish that - it is a feature flag, and an https staging box with it
       on was handed cookies with no `Secure` at all. */
    return this.isLocalAuthEnabled() && this.isPlaintextDeployment()
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
