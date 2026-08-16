import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { Configuration, randomState } from "openid-client";
import { AuthenticateOptions, Strategy } from "openid-client/passport";
import { Provider } from "../../generated/prisma/client";
import { UsersService } from "../../users/services";
import {
  buildOidcConfig,
  fetchOidcUserinfo,
  findOrCreateProviderUser,
  oidcStrategyOptions,
  OidcProviderKeys,
  OidcTokens,
} from "./oidc";
import { withAuthorizationState } from "./authorization-state";

const VIPPS_KEYS: OidcProviderKeys = {
  issuerEnvKey: "VIPPS_OIDC_ISSUER",
  clientIdKey: "VIPPS_OIDC_LOGIN_CLIENT_ID",
  clientSecretKey: "VIPPS_OIDC_LOGIN_CLIENT_SECRET",
  redirectUriKey: "VIPPS_OIDC_LOGIN_REDIRECT_URI",
  scopeKey: "VIPPS_OIDC_LOGIN_SCOPE",
};

export const buildVippsConfig = (configService: ConfigService) =>
  buildOidcConfig(configService, VIPPS_KEYS);

export class VippsStrategy extends PassportStrategy(Strategy, "vipps") {
  constructor(
    private readonly config: Configuration,
    private readonly userService: UsersService,
    configService: ConfigService,
  ) {
    super(oidcStrategyOptions(config, configService, VIPPS_KEYS));
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
