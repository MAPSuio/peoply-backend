import { SessionData } from "express-session";
import {
  BoundedTtlSessionStore,
  MAX_OAUTH_SESSIONS,
  OAUTH_SESSION_TTL_MS,
  oauthSessionOptions,
} from "./oauth-session";

// What openid-client's passport strategy actually writes into req.session.
const oauthSession = (expires?: Date) =>
  ({
    cookie: { expires, originalMaxAge: OAUTH_SESSION_TTL_MS },
    "oidc:api.vipps.no": {
      state: "s".repeat(43),
      nonce: "n".repeat(43),
      code_verifier: "v".repeat(43),
      response_type: "code",
    },
  }) as unknown as SessionData;

const get = (store: BoundedTtlSessionStore, sid: string) =>
  new Promise<SessionData | null | undefined>((resolve, reject) =>
    store.get(sid, (err, session) => (err ? reject(err) : resolve(session))),
  );

describe("BoundedTtlSessionStore", () => {
  let clock: number;
  const now = () => clock;

  beforeEach(() => {
    clock = 1_000_000;
  });

  it("returns a session that has not expired", async () => {
    const store = new BoundedTtlSessionStore(10, 1000, now);
    store.set("a", oauthSession());

    await expect(get(store, "a")).resolves.toMatchObject({
      "oidc:api.vipps.no": { state: "s".repeat(43) },
    });
  });

  it("returns nothing for an unknown session id", async () => {
    const store = new BoundedTtlSessionStore(10, 1000, now);
    await expect(get(store, "nope")).resolves.toBeFalsy();
  });

  it("drops an entry once its ttl has passed, without being asked", async () => {
    const store = new BoundedTtlSessionStore(10, 1000, now);
    store.set("a", oauthSession());

    clock += 1001;

    await expect(get(store, "a")).resolves.toBeFalsy();
    expect(store.size).toBe(0);
  });

  it("prefers the cookie's own expiry when express-session sets one", async () => {
    const store = new BoundedTtlSessionStore(10, 60_000, now);
    store.set("a", oauthSession(new Date(clock + 500)));

    clock += 501;

    await expect(get(store, "a")).resolves.toBeFalsy();
  });

  it("never exceeds its cap, no matter how many logins are abandoned", () => {
    // The regression this store exists for: express-session's MemoryStore only
    // evicts inside a lookup of that same id, so a login that is started and
    // never finished is never revisited and never freed. 20,000 abandoned
    // logins measured as 20,000 permanent entries, 0 evicted.
    const store = new BoundedTtlSessionStore(100, 60_000, now);

    for (let i = 0; i < 20_000; i++) {
      store.set(`abandoned-${i}`, oauthSession());
    }

    expect(store.size).toBeLessThanOrEqual(100);
  });

  it("evicts expired entries before live ones when it hits the cap", async () => {
    const store = new BoundedTtlSessionStore(2, 1000, now);

    store.set("stale", oauthSession());
    clock += 2000;
    store.set("live", oauthSession());
    store.set("also-live", oauthSession());

    expect(store.size).toBe(2);
    await expect(get(store, "stale")).resolves.toBeFalsy();
    await expect(get(store, "live")).resolves.toBeTruthy();
    await expect(get(store, "also-live")).resolves.toBeTruthy();
  });

  it("evicts the least recently written when everything is still live", async () => {
    const store = new BoundedTtlSessionStore(2, 60_000, now);

    store.set("first", oauthSession());
    store.set("second", oauthSession());
    store.set("third", oauthSession());

    await expect(get(store, "first")).resolves.toBeFalsy();
    await expect(get(store, "second")).resolves.toBeTruthy();
    await expect(get(store, "third")).resolves.toBeTruthy();
  });

  it("re-writing a session refreshes its place in the eviction order", async () => {
    const store = new BoundedTtlSessionStore(2, 60_000, now);

    store.set("first", oauthSession());
    store.set("second", oauthSession());
    store.set("first", oauthSession());
    store.set("third", oauthSession());

    await expect(get(store, "first")).resolves.toBeTruthy();
    await expect(get(store, "second")).resolves.toBeFalsy();
  });

  it("destroy removes the entry, so a consumed callback frees its slot", async () => {
    const store = new BoundedTtlSessionStore(10, 60_000, now);
    store.set("a", oauthSession());
    store.destroy("a");

    await expect(get(store, "a")).resolves.toBeFalsy();
    expect(store.size).toBe(0);
  });

  it("touch extends an existing entry and ignores an unknown one", async () => {
    const store = new BoundedTtlSessionStore(10, 1000, now);
    store.set("a", oauthSession());

    clock += 900;
    store.touch("a", oauthSession(new Date(clock + 1000)));
    store.touch("ghost", oauthSession());

    clock += 500;
    await expect(get(store, "a")).resolves.toBeTruthy();
    expect(store.size).toBe(1);
  });

  it("reports its length and clears", (done) => {
    const store = new BoundedTtlSessionStore(10, 60_000, now);
    store.set("a", oauthSession());
    store.set("b", oauthSession());

    store.length((err, length) => {
      expect(err).toBeNull();
      expect(length).toBe(2);
      store.clear();
      expect(store.size).toBe(0);
      done();
    });
  });
});

describe("oauthSessionOptions", () => {
  it("marks the cookie secure in production", () => {
    expect(oauthSessionOptions("secret", true).cookie).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: OAUTH_SESSION_TTL_MS,
    });
  });

  it("does not require https locally, where there is none", () => {
    expect(oauthSessionOptions("secret", false).cookie).toMatchObject({
      secure: false,
    });
  });

  it("uses lax, not strict: the IdP callback is a cross-site top-level GET", () => {
    // "strict" would withhold the cookie on the callback and break every login.
    expect(oauthSessionOptions("secret", true).cookie).toMatchObject({
      sameSite: "lax",
    });
  });

  it("does not persist sessions for visitors who never start a login", () => {
    expect(oauthSessionOptions("secret", true).saveUninitialized).toBe(false);
  });

  it("uses the bounded store rather than the default MemoryStore", () => {
    expect(oauthSessionOptions("secret", true).store).toBeInstanceOf(
      BoundedTtlSessionStore,
    );
  });

  it("caps the default store", () => {
    expect(MAX_OAUTH_SESSIONS).toBeLessThanOrEqual(100_000);
  });
});
