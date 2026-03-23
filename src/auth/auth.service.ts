import { ForbiddenException, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { User } from ".prisma/client";
import { CookieOptions } from "express";

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  private baseCookieOptions: {
    sameSite: "lax";
    httpOnly: boolean;
    secure: boolean;
  } = {
    sameSite: "lax",
    httpOnly: true,
    secure: true,
  };

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
      ...this.baseCookieOptions,
      maxAge:
        this.configService.get<number>("JWT_ACCESS_TOKEN_EXP_TIME", {
          infer: true,
        }) * 1000,
    };
  }

  getRefreshCookieOptions(): CookieOptions {
    return {
      ...this.baseCookieOptions,
      maxAge:
        this.configService.get<number>("JWT_REFRESH_TOKEN_EXP_TIME", {
          infer: true,
        }) * 1000,
      path: "/auth",
    };
  }

  assertTrustedOrigin(origin?: string) {
    const trustedOrigin = this.configService.get<string | string[]>(
      "CORS_ORIGIN",
    );

    if (!trustedOrigin) {
      throw new Error("CORS_ORIGIN not configured");
    }

    const trustedOrigins = Array.isArray(trustedOrigin)
      ? trustedOrigin
      : trustedOrigin
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean);

    if (!origin || !trustedOrigins.includes(origin)) {
      throw new ForbiddenException("Untrusted origin");
    }
  }
}
