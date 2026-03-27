import { ForbiddenException, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { User } from ".prisma/client";
import { CookieOptions } from "express";
import { extractRequestOrigin, parseTrustedOrigins } from "./auth-origin";

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
      expiresIn: `${this.configService.get<number>(
        "JWT_REFRESH_TOKEN_EXP_TIME",
      )}s`,
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

  assertTrustedOrigin(headers: { origin?: string; referer?: string }) {
    const trustedOrigins = parseTrustedOrigins(
      this.configService.get<string>("CORS_ORIGIN"),
    );

    if (!trustedOrigins.length) {
      throw new Error("CORS_ORIGIN not configured");
    }

    const requestOrigin = extractRequestOrigin(headers);

    if (!requestOrigin || !trustedOrigins.includes(requestOrigin)) {
      throw new ForbiddenException("Untrusted origin");
    }
  }
}
