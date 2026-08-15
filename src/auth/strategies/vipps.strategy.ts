import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { Provider } from "../../generated/prisma/client";
import { Strategy, Client, UserinfoResponse, TokenSet } from "openid-client";
import { UsersService } from "../../users/services";
import {
  buildOidcClient,
  findOrCreateProviderUser,
  oidcStrategyOptions,
  OidcProviderKeys,
} from "./oidc";

const VIPPS_KEYS: OidcProviderKeys = {
  issuerEnvKey: "VIPPS_OIDC_ISSUER",
  clientIdKey: "VIPPS_OIDC_LOGIN_CLIENT_ID",
  clientSecretKey: "VIPPS_OIDC_LOGIN_CLIENT_SECRET",
  redirectUriKey: "VIPPS_OIDC_LOGIN_REDIRECT_URI",
  scopeKey: "VIPPS_OIDC_LOGIN_SCOPE",
};

export const buildVippsClient = (configService: ConfigService) =>
  buildOidcClient(configService, VIPPS_KEYS);

export class VippsStrategy extends PassportStrategy(Strategy, "vipps") {
  client: Client;

  constructor(
    client: Client,
    private userService: UsersService,
    configService: ConfigService,
  ) {
    super(oidcStrategyOptions(client, configService, VIPPS_KEYS));

    this.client = client;
  }

  async validate(tokenset: TokenSet): Promise<any> {
    const userinfo: UserinfoResponse = await this.client.userinfo(tokenset);

    const {
      email,
      phone_number: phone,
      given_name: firstName,
      family_name: lastName,
      birthdate: birthDate,
    } = userinfo;

    /* Vipps is the identity-verified provider, so it is the one asked for
       phone and birth date - both are required columns for a Vipps user. */
    if (!(email && phone && firstName && lastName && birthDate)) {
      throw new UnauthorizedException("Missing user info");
    }

    return await findOrCreateProviderUser(
      this.userService,
      Provider.VIPPS,
      userinfo.sub,
      {
        email,
        phone,
        firstName,
        lastName,
        birthDate: new Date(birthDate).toISOString(),
      },
    );
  }
}
