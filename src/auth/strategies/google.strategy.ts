// src/auth/oidc.strategy.ts
import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { Provider } from "../../generated/prisma/client";
import {
  Strategy,
  Client,
  UserinfoResponse,
  TokenSet,
  Issuer,
} from "openid-client";
import { UsersService } from "../../users/services";

export const buildGoogleClient = async (configService: ConfigService) => {
  const TrustIssuer = await Issuer.discover(
    `${process.env.GOOGLE_OIDC_ISSUER}/.well-known/openid-configuration`,
  );
  const client = new TrustIssuer.Client({
    client_id: configService.get<string>("GOOGLE_OIDC_LOGIN_CLIENT_ID")!,
    client_secret: configService.get<string>(
      "GOOGLE_OIDC_LOGIN_CLIENT_SECRET",
    )!,
  });
  return client;
};

export class GoogleStrategy extends PassportStrategy(Strategy, "google") {
  client: Client;

  constructor(
    client: Client,
    private userService: UsersService,
    configService: ConfigService,
  ) {
    super({
      client: client,
      params: {
        redirect_uri: configService.get<string>(
          "GOOGLE_OIDC_LOGIN_REDIRECT_URI",
        ),
        scope: configService.get<string>("GOOGLE_OIDC_LOGIN_SCOPE"),
      },
    });

    this.client = client;
  }

  async validate(tokenset: TokenSet): Promise<any> {
    /* get user info from vipps */
    const userinfo: UserinfoResponse = await this.client.userinfo(tokenset);

    const {
      email,
      email_verified: emailVerified,
      given_name: firstName,
      family_name: lastName,
    } = userinfo;

    if (!(email && firstName && lastName)) {
      throw new UnauthorizedException("Missing user info");
    }

    if (!emailVerified) {
      throw new UnauthorizedException("Email not verified");
    }

    /* check if user exists */
    const user = await this.userService.findByProviderSub(
      Provider.GOOGLE,
      userinfo.sub,
    );

    if (!user) {
      /* this may fail, as phone or email could belong to existing user. */
      /* We could connect these accounts if phone AND email are equal */
      /* or some similar strategy */
      /* Currently a Vipps user is separate from a potential Google user. */
      const newUser = await this.userService.create(
        {
          email,
          firstName,
          lastName,
        },
        Provider.GOOGLE,
        userinfo.sub,
      );

      return newUser;
    }

    return user;
  }
}
