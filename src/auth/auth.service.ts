import { Injectable } from "@nestjs/common";
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

  // Should be sameSite: true, but temp fix
  private baseCookieOptions: {
    sameSite: "none";
    httpOnly: boolean;
    secure: boolean;
  } = {
    sameSite: "none",
    httpOnly: true,
    secure: true,
  };

  validateJWT(token: string) {
    return this.jwtService.verify(token);
  }

  getAccessToken(user: User) {
    const payload = { sub: user.id };
    return this.jwtService.sign(payload); // configured in AuthModule
  }

  getRefreshToken(user: User) {
    const payload = { sub: user.id };
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
