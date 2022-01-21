// src/auth/oidc.strategy.ts
import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import {
  Strategy,
  Client,
  UserinfoResponse,
  TokenSet,
  Issuer,
} from "openid-client";

import { UsersService } from "src/users/users.service";

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

    /* either find existing or create a new user based on user info */
    const userByPhone = await this.userService.findByPhone(phone.substring(2));
    const userByEmail = await this.userService.findByEmail(email);
    if (!userByPhone && userByEmail) {
      throw new UnauthorizedException("User with that email already exists");
    } else if (
      userByPhone &&
      userByEmail &&
      userByPhone.user_id !== userByEmail.user_id
    ) {
      /* found user by phone and email, but they are not the same user */
      throw new UnauthorizedException("User with that email already exists");
    } else if (userByPhone) {
      /* TODO: Here we should update the user information with information from vipps */
      return userByPhone;
    } else {
      /* if user does not exist, create one */
      const createdUser = await this.userService.create({
        phone: phone.substring(2), // remove NO country code
        first_name,
        last_name,
        email,
        birth_date: new Date(birth_date).toISOString(), // convert to proper ISO
      });

      return createdUser;
    }
  }
}
