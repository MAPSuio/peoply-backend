import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { users } from ".prisma/client";

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  getAccessToken(user: users) {
    const payload = { sub: user.user_id };
    return this.jwtService.sign(payload); // configured in AuthModule
  }

  getRefreshTokenCookie(user: users) {
    const payload = { sub: user.user_id };
    const token = this.jwtService.sign(payload, {
      secret: this.configService.get<string>("JWT_REFRESH_TOKEN_SECRET"),
      expiresIn: this.configService.get<string>("JWT_REFRESH_TOKEN_EXP_TIME"),
    });
    const cookie = `Refresh=${token}; HttpOnly; Path=/; Max-Age=${this.configService.get(
      "JWT_REFRESH_TOKEN_EXP_TIME",
    )};`;

    return cookie;
  }
}
