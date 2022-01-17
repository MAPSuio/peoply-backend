import { ExtractJwt, Strategy } from "passport-jwt";
import { PassportStrategy } from "@nestjs/passport";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { UsersService } from "src/users/users.service";

@Injectable()
export class RefreshStrategy extends PassportStrategy(
  Strategy,
  "refresh_token",
) {
  constructor(configService: ConfigService, private userService: UsersService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: any) => {
          return req.cookies.refresh;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>("JWT_REFRESH_TOKEN_SECRET"),
    });
  }

  async validate(payload: any) {
    const user = await this.userService.findById(payload.sub);
    return user;
  }
}
