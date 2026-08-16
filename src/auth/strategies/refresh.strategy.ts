import { ExtractJwt, Strategy } from "passport-jwt";
import { PassportStrategy } from "@nestjs/passport";
import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request } from "express";
import { UsersService } from "../../users/services";
import { collectRefreshCookies, pickRefreshToken } from "../refresh-cookie";

// Module-scoped so the cookie extractor can log before `this` is available
// (the extractor is passed into super(), where `this` is not yet initialized).
const logger = new Logger("RefreshStrategy");

@Injectable()
export class RefreshStrategy extends PassportStrategy(
  Strategy,
  "refresh_token",
) {
  private readonly logger = logger;

  constructor(
    configService: ConfigService,
    private userService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => {
          // Read the raw header rather than req.cookies: with duplicate
          // `refresh` cookies (the pre-2026-03-23 "/auth/refresh"-path one
          // shadowing the current "/auth" one) cookie-parser only exposes
          // the stale duplicate, which 401s here without a trace. The secret
          // is passed so the pick can skip duplicates whose signature is
          // from a rotated secret — their exp alone does not identify them.
          const candidates = collectRefreshCookies(req.headers.cookie);
          const token = pickRefreshToken(
            req.headers.cookie,
            configService.get<string>("JWT_REFRESH_TOKEN_SECRET"),
          );

          if (candidates.length > 1) {
            logger.warn(
              `Refresh: ${candidates.length} duplicate refresh cookies sent, picked an unexpired one`,
            );
          }

          if (!token) {
            // Cookie absent → passport rejects before validate() runs, so this
            // is the only place a missing/blocked refresh cookie is visible.
            logger.warn("Refresh denied: missing_cookie");
          }
          return token ?? null;
        },
      ]),
      ignoreExpiration: false,
      // getOrThrow: @types/passport-jwt 4 no longer accepts undefined, and a
      // boot-time failure beats every token verification failing at runtime.
      secretOrKey: configService.getOrThrow<string>("JWT_REFRESH_TOKEN_SECRET"),
    });
  }

  async validate(payload: any) {
    const user = await this.userService.findById(payload.sub);

    if (!user) {
      this.logger.warn(`Refresh denied: user_not_found sub=${payload?.sub}`);
      throw new UnauthorizedException();
    }

    if (!payload.tokenId) {
      this.logger.warn(`Refresh denied: missing_token_id sub=${payload.sub}`);
      throw new UnauthorizedException();
    }

    if (user.refreshTokenId !== payload.tokenId) {
      // Most likely a stale cookie from another device/tab after a logout
      // or (historically) after a login that rotated the tokenId. Tracked
      // so we can confirm the rotation fix actually moved the needle.
      this.logger.warn(`Refresh denied: token_id_mismatch sub=${payload.sub}`);
      throw new UnauthorizedException();
    }

    return user;
  }
}
