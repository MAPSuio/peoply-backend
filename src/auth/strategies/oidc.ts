import { ConfigService } from "@nestjs/config";
import * as client from "openid-client";
import { Provider, User } from "../../generated/prisma/client";
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
 * Discovers the provider's endpoints and builds the openid-client v6
 * Configuration for them - v6 dropped the Issuer/Client classes for this one
 * object. discovery() derives the well-known URL from the issuer identifier
 * itself, so unlike v5 the suffix must not be appended here.
 *
 * The module has to await this before constructing the strategy, because the
 * configuration is a constructor argument to passport's super call.
 *
 * `clientAuth` is how the client authenticates at the token endpoint. Each
 * provider must spell it out because v5 and v6 disagree on the default and
 * the disagreement is silent: v5's Client defaulted to `client_secret_basic`,
 * which is also the default OIDC assigns when a client says nothing, while v6
 * defaults to ClientSecretPost. Getting it wrong surfaces only at the
 * callback, as a 500 after the user has already approved at the provider -
 * the authorization redirect succeeds either way.
 */
export const buildOidcConfig = async (
  configService: ConfigService,
  keys: OidcProviderKeys,
  clientAuth: (clientSecret: string) => client.ClientAuth,
) => {
  const issuer = process.env[keys.issuerEnvKey];

  if (!issuer) {
    throw new Error(`${keys.issuerEnvKey} is not set`);
  }

  const clientSecret = configService.getOrThrow<string>(keys.clientSecretKey);

  try {
    return await client.discovery(
      new URL(issuer),
      configService.getOrThrow<string>(keys.clientIdKey),
      clientSecret,
      clientAuth(clientSecret),
    );
  } catch (error) {
    const discovered = discoveredIssuer(error);

    if (discovered === undefined || discovered === issuer) {
      throw error;
    }

    throw new Error(
      `${keys.issuerEnvKey} is "${issuer}", but the provider's discovery ` +
        `document says its issuer is "${discovered}". These have to match ` +
        `exactly. Set ${keys.issuerEnvKey}="${discovered}".`,
    );
  }
};

/**
 * The `issuer` openid-client read out of the discovery document, when it
 * rejected it for not matching the identifier we asked for.
 *
 * v5 fetched whatever URL it was handed and never compared identifiers, so
 * this variable only had to be a prefix that `/.well-known/...` could be
 * pasted onto. v6 compares it against the document's own `issuer` and refuses
 * to boot when they differ by so much as a trailing slash, which is exactly
 * how Vipps publishes theirs. Every previously valid value became a boot
 * crash whose message names neither the variable nor what to set it to.
 */
function discoveredIssuer(error: unknown) {
  const issuer = (error as { cause?: { body?: { issuer?: unknown } } })?.cause
    ?.body?.issuer;

  return typeof issuer === "string" ? issuer : undefined;
}

/** The options every provider's strategy passes to passport. */
export const oidcStrategyOptions = (
  config: client.Configuration,
  configService: ConfigService,
  keys: OidcProviderKeys,
) => ({
  config,
  scope: configService.getOrThrow<string>(keys.scopeKey),
  callbackURL: configService.getOrThrow<string>(keys.redirectUriKey),
});

/**
 * What a strategy's validate() resolves the provider's subject to. Passport
 * puts this on `req.user`, and the callback decides what it becomes: a login,
 * a link onto the session user, or a pending link behind the confirm modal.
 *
 * The strategies used to create the user right here, but a strategy has no
 * request — it cannot tell a first-time signup from a settings-initiated
 * "attach this identity to the logged-in user", so the decision had to move
 * to where the session is.
 */
export type OidcResolution =
  | { status: "existing"; user: User }
  | { status: "new"; provider: Provider; sub: string; profile: CreateUserDto };

/** Looks the user up by the provider's subject identifier. Never creates. */
export const resolveProviderUser = async (
  userService: UsersService,
  provider: Provider,
  sub: string,
  profile: CreateUserDto,
): Promise<OidcResolution> => {
  const user = await userService.findByProviderSub(provider, sub);

  if (user) {
    return { status: "existing", user };
  }

  return { status: "new", provider, sub, profile };
};

/**
 * What a strategy's validate() receives from openid-client v6's passport
 * strategy: the token endpoint response plus its claims()/expiresIn() helpers.
 */
export type OidcTokens = client.TokenEndpointResponse &
  client.TokenEndpointResponseHelpers;

/**
 * Fetches the userinfo the way v5's client.userinfo(tokenset) did: the
 * subject from the ID token is required and verified against the response.
 * Both providers request the openid scope, so an ID token is always present -
 * a response without one fails here rather than in the field checks after.
 */
export const fetchOidcUserinfo = async (
  config: client.Configuration,
  tokens: OidcTokens,
) => {
  const sub = tokens.claims()?.sub;

  if (!sub) {
    throw new Error("Token response carried no ID token subject");
  }

  return await client.fetchUserInfo(config, tokens.access_token, sub);
};
