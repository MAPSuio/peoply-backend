/**
 * Adds a `state` to an OIDC authorization request.
 *
 * openid-client v6's passport strategy only generates one when the provider
 * does *not* advertise PKCE (node_modules/openid-client/build/passport.js):
 *
 *     if (!this._config.serverMetadata().supportsPKCE() &&
 *         !redirectTo.searchParams.has('nonce')) {
 *       redirectTo.searchParams.set('state', client.randomState())
 *     }
 *
 * Defensible on its own terms: PKCE covers what `state` was originally added
 * for. Vipps advertises S256 and requires `state` anyway, and answers a
 * request without one by sending the user to its own error page - "The state
 * parameter is missing or does not have enough characters. It must be at least
 * 5 characters long." So every Vipps login broke at the redirect, before the
 * user ever reached a Vipps screen, the moment the v6 migration deployed.
 *
 * The strategy exposes no option for this: `AuthenticateOptions.state` is
 * typed `never` and documented as ignored. It does, however, build the
 * authorization URL from whatever `authorizationRequestParams()` returns, and
 * reads the value back out of that URL to store in the session and check on
 * the callback:
 *
 *     if ((state = redirectTo.searchParams.get('state'))) stateData.state = state
 *     ...
 *     expectedState: stateData.state
 *
 * so a state added here is genuinely round-tripped and verified.
 *
 * `generateState` is a parameter rather than an import because openid-client
 * is ESM-only and this repository's Jest setup cannot load it, which would put
 * this logic out of reach of a unit test. The strategies pass
 * `client.randomState`.
 */
export function withAuthorizationState(
  params: URLSearchParams | Record<string, string> | undefined,
  generateState: () => string,
): URLSearchParams {
  const withState =
    params instanceof URLSearchParams
      ? new URLSearchParams(params)
      : new URLSearchParams(params ?? {});

  if (!withState.has("state")) {
    withState.set("state", generateState());
  }

  return withState;
}
