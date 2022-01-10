import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { users } from ".prisma/client";
import { CookieOptions } from "express";

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  private baseCookieOptions = { sameSite: true, httpOnly: true, secure: true };

  getAccessToken(user: users) {
    const payload = { sub: user.user_id };
    return this.jwtService.sign(payload); // configured in AuthModule
  }

  getRefreshToken(user: users) {
    const payload = { sub: user.user_id };
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
      path: "/auth/refresh",
    };
  }
}
