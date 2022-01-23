// src/auth/oidc.strategy.ts
import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { providers } from ".prisma/client";
import {
  Strategy,
  Client,
  UserinfoResponse,
  TokenSet,
  Issuer,
} from "openid-client";
import { UsersService } from "../../users/users.service";

export const buildOpenIdClient = async (configService: ConfigService) => {
  const TrustIssuer = await Issuer.discover(
    `${process.env.VIPPS_OIDC_ISSUER}/.well-known/openid-configuration`,
  );
  const client = new TrustIssuer.Client({
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    client_id: configService.get<string>("VIPPS_OIDC_LOGIN_CLIENT_ID")!,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    client_secret: configService.get<string>("VIPPS_OIDC_LOGIN_CLIENT_SECRET")!,
  });
  return client;
};

export class OidcStrategy extends PassportStrategy(Strategy, "oidc") {
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
          "VIPPS_OIDC_LOGIN_REDIRECT_URI",
        ),
        scope: configService.get<string>("VIPPS_OIDC_LOGIN_SCOPE"),
      },
    });

    this.client = client;
  }

  async validate(tokenset: TokenSet): Promise<any> {
    /* get user info from vipps */
    const userinfo: UserinfoResponse = await this.client.userinfo(tokenset);

    const {
      email,
      phone_number: phone,
      given_name: first_name,
      family_name: last_name,
      birthdate: birth_date,
      address,
    } = userinfo;

    if (!(email && phone && first_name && last_name && birth_date && address)) {
      throw new UnauthorizedException("Missing user info");
    }

    /* check if user exists */
    const user = await this.userService.findByProviderSub(
      providers.VIPPS,
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
          phone,
          first_name,
          last_name,
          birth_date: new Date(birth_date).toISOString(),
        },
        providers.VIPPS,
        userinfo.sub,
      );

      return newUser;
    }

    return user;
  }
}
