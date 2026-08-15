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

const GOOGLE_KEYS: OidcProviderKeys = {
  issuerEnvKey: "GOOGLE_OIDC_ISSUER",
  clientIdKey: "GOOGLE_OIDC_LOGIN_CLIENT_ID",
  clientSecretKey: "GOOGLE_OIDC_LOGIN_CLIENT_SECRET",
  redirectUriKey: "GOOGLE_OIDC_LOGIN_REDIRECT_URI",
  scopeKey: "GOOGLE_OIDC_LOGIN_SCOPE",
};

export const buildGoogleClient = (configService: ConfigService) =>
  buildOidcClient(configService, GOOGLE_KEYS);

export class GoogleStrategy extends PassportStrategy(Strategy, "google") {
  client: Client;

  constructor(
    client: Client,
    private userService: UsersService,
    configService: ConfigService,
  ) {
    super(oidcStrategyOptions(client, configService, GOOGLE_KEYS));

    this.client = client;
  }

  async validate(tokenset: TokenSet): Promise<any> {
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

    /* An unverified address would let anyone who can create a Google account
       for someone else's address log in as them. */
    if (!emailVerified) {
      throw new UnauthorizedException("Email not verified");
    }

    return await findOrCreateProviderUser(
      this.userService,
      Provider.GOOGLE,
      userinfo.sub,
      { email, firstName, lastName },
    );
  }
}
