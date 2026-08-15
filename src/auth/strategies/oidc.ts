import { ConfigService } from "@nestjs/config";
import { Client, Issuer } from "openid-client";
import { Provider } from "../../generated/prisma/client";
import { CreateUserDto } from "../../users/dto";
import { UsersService } from "../../users/services";

/**
 * The config keys one OIDC provider is set up with. Each provider has its own
 * set under its own prefix, and nothing but the prefix differs.
 */
export interface OidcProviderKeys {
  /** Read from process.env rather than ConfigService, as it always has been. */
  issuerEnvKey: string;
  clientIdKey: string;
  clientSecretKey: string;
  redirectUriKey: string;
  scopeKey: string;
}

/**
 * Discovers the provider's endpoints and builds a client for them.
 *
 * The module has to await this before constructing the strategy, because the
 * client is a constructor argument to passport's super call.
 */
export const buildOidcClient = async (
  configService: ConfigService,
  keys: OidcProviderKeys,
) => {
  const trustIssuer = await Issuer.discover(
    `${process.env[keys.issuerEnvKey]}/.well-known/openid-configuration`,
  );

  return new trustIssuer.Client({
    client_id: configService.get<string>(keys.clientIdKey)!,
    client_secret: configService.get<string>(keys.clientSecretKey)!,
  });
};

/** The options every provider's strategy passes to passport. */
export const oidcStrategyOptions = (
  client: Client,
  configService: ConfigService,
  keys: OidcProviderKeys,
) => ({
  client,
  params: {
    redirect_uri: configService.get<string>(keys.redirectUriKey),
    scope: configService.get<string>(keys.scopeKey),
  },
});

/**
 * Looks the user up by the provider's subject identifier and creates them on
 * first login.
 *
 * Creating may fail because the phone or email already belongs to an existing
 * user. We could connect the accounts when both match, or something similar;
 * as it stands a Vipps user is separate from a potential Google user.
 */
export const findOrCreateProviderUser = async (
  userService: UsersService,
  provider: Provider,
  sub: string,
  createUserDto: CreateUserDto,
) => {
  const user = await userService.findByProviderSub(provider, sub);

  if (user) {
    return user;
  }

  return await userService.create(createUserDto, provider, sub);
};
