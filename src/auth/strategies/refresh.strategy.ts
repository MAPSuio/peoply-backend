import { ExtractJwt, Strategy } from "passport-jwt";
import { PassportStrategy } from "@nestjs/passport";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class RefreshStrategy extends PassportStrategy(
  Strategy,
  "refresh_token",
) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: any) => {
          return req.cookies.Refresh;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>("JWT_REFRESH_TOKEN_SECRET"),
    });
  }

  async validate(payload: any) {
    return { user_id: payload.sub };
  }
}
