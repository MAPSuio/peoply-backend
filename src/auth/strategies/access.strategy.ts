import { ExtractJwt, Strategy } from "passport-jwt";
import { PassportStrategy } from "@nestjs/passport";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request } from "express";
import { AccessSessionService } from "../access-session.service";

@Injectable()
export class AccessStrategy extends PassportStrategy(Strategy, "access_token") {
  constructor(
    configService: ConfigService,
    private accessSession: AccessSessionService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => {
          return req.cookies.access;
        },
      ]),
      ignoreExpiration: false,
      // getOrThrow: @types/passport-jwt 4 no longer accepts undefined, and a
      // boot-time failure beats every token verification failing at runtime.
      secretOrKey: configService.getOrThrow<string>("JWT_ACCESS_TOKEN_SECRET"),
    });
  }

  async validate(payload: unknown) {
    return this.accessSession.userFromPayload(payload as never);
  }
}
