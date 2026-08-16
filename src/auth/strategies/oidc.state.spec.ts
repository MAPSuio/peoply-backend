import { withAuthorizationState } from "./authorization-state";

/**
 * openid-client v6 omits `state` from the authorization request whenever the
 * provider advertises PKCE. Vipps advertises S256 and requires `state` anyway,
 * and answers a request without one by redirecting the user to its own error
 * page rather than to a login screen, so every Vipps login broke the moment
 * the v6 migration deployed.
 */
describe("withAuthorizationState", () => {
  /* Stands in for client.randomState, which cannot be imported here:
     openid-client is ESM-only and this Jest setup cannot load it. Counts up
     so the "different every time" case has something to compare. */
  let counter = 0;
  const generateState = () => {
    counter += 1;
    return `state-${counter}-abcdefgh`;
  };

  it("adds a state when the strategy produced none", () => {
    const params = withAuthorizationState(undefined, generateState);

    expect(params.get("state")).toBeTruthy();
  });

  it("gives a different state each time", () => {
    const first = withAuthorizationState(undefined, generateState).get("state");
    const second = withAuthorizationState(undefined, generateState).get(
      "state",
    );

    expect(first).not.toEqual(second);
  });

  it("keeps the parameters the strategy already built", () => {
    const params = withAuthorizationState(
      new URLSearchParams({ scope: "openid email", prompt: "consent" }),
      generateState,
    );

    expect(params.get("scope")).toBe("openid email");
    expect(params.get("prompt")).toBe("consent");
    expect(params.get("state")).toBeTruthy();
  });

  it("accepts the plain-object shape the hook may also return", () => {
    const params = withAuthorizationState(
      { login_hint: "a@b.no" },
      generateState,
    );

    expect(params.get("login_hint")).toBe("a@b.no");
    expect(params.get("state")).toBeTruthy();
  });

  /* If a caller ever passes its own state, that one is the one the session
     stores and the callback verifies. Overwriting it here would break the
     comparison rather than help it. */
  it("leaves an existing state alone", () => {
    const params = withAuthorizationState(
      new URLSearchParams({ state: "caller-supplied" }),
      generateState,
    );

    expect(params.get("state")).toBe("caller-supplied");
  });

  it("does not mutate the input", () => {
    const input = new URLSearchParams({ scope: "openid" });

    withAuthorizationState(input, generateState);

    expect(input.has("state")).toBe(false);
  });
});
