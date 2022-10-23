import { ExtractJwt, Strategy } from "passport-jwt";
import { PassportStrategy } from "@nestjs/passport";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request } from "express";
import { UsersService } from "../../users/services";

@Injectable()
export class AccessStrategy extends PassportStrategy(Strategy, "access_token") {
  constructor(configService: ConfigService, private userService: UsersService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => {
          return req.cookies.access;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>("JWT_ACCESS_TOKEN_SECRET"),
    });
  }

  async validate(payload: any) {
    const user = await this.userService.findById(payload.sub);

    if (!user) {
      throw new UnauthorizedException();
    }

    return user;
  }
}
