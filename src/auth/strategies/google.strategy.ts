import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ClientSecretPost, Configuration, randomState } from "openid-client";
import { AuthenticateOptions, Strategy } from "openid-client/passport";
import { Provider } from "../../generated/prisma/client";
import { UsersService } from "../../users/services";
import {
  buildOidcConfig,
  fetchOidcUserinfo,
  oidcStrategyOptions,
  OidcProviderKeys,
  OidcTokens,
  resolveProviderUser,
} from "./oidc";
import { withAuthorizationState } from "./authorization-state";

const GOOGLE_KEYS: OidcProviderKeys = {
  issuerEnvKey: "GOOGLE_OIDC_ISSUER",
  clientIdKey: "GOOGLE_OIDC_LOGIN_CLIENT_ID",
  clientSecretKey: "GOOGLE_OIDC_LOGIN_CLIENT_SECRET",
  redirectUriKey: "GOOGLE_OIDC_LOGIN_REDIRECT_URI",
  scopeKey: "GOOGLE_OIDC_LOGIN_SCOPE",
};

export const buildGoogleConfig = (configService: ConfigService) =>
  /* Google supports both Basic and Post, but its token endpoint does not
     urldecode Basic credentials, while oauth4webapi percent-encodes them as
     RFC 6749 requires. The `-` and `.` in every Google client id arrive as
     `%2D`/`%2E`, and Google rejects the exchange with `invalid_client`:
     "The OAuth client was not found." */
  buildOidcConfig(configService, GOOGLE_KEYS, ClientSecretPost);

export class GoogleStrategy extends PassportStrategy(Strategy, "google") {
  constructor(
    private readonly config: Configuration,
    private readonly userService: UsersService,
    configService: ConfigService,
  ) {
    super(oidcStrategyOptions(config, configService, GOOGLE_KEYS));
  }

  /* See withAuthorizationState: v6 omits `state` for providers that
     advertise PKCE, and this one rejects the request without it. */
  authorizationRequestParams<TOptions extends AuthenticateOptions>(
    req: Parameters<Strategy["authorizationRequestParams"]>[0],
    options: TOptions,
  ) {
    return withAuthorizationState(
      super.authorizationRequestParams(req, options),
      randomState,
    );
  }

  async validate(tokens: OidcTokens): Promise<any> {
    const userinfo = await fetchOidcUserinfo(this.config, tokens);

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

    return await resolveProviderUser(
      this.userService,
      Provider.GOOGLE,
      userinfo.sub,
      {
        email,
        firstName,
        lastName,
      },
    );
  }
}
