import { Store, SessionData, SessionOptions } from "express-session";

/**
 * The express session exists for exactly one purpose: openid-client's passport
 * strategy keeps the OAuth `state`, `nonce` and PKCE `code_verifier` in
 * `req.session` between the redirect to Vipps/Google and the callback
 * (node_modules/openid-client/lib/passport_strategy.js, which writes
 * `req.session[sessionKey]` on the way out and reads it back on the way in).
 *
 * Nothing else in the codebase touches `req.session` — there is no
 * serializeUser/deserializeUser — so ten minutes is a generous ceiling for
 * "click login, authenticate at the IdP, come back".
 */
export const OAUTH_SESSION_TTL_MS = 10 * 60 * 1000;

/**
 * Roughly 3 MB at the ~290 bytes a serialised OAuth session actually occupies.
 *
 * Only reached under abuse: it is one entry per login *in flight*, and a real
 * one is deleted the moment the callback consumes it.
 */
export const MAX_OAUTH_SESSIONS = 10_000;

/**
 * A session store that is bounded in both time and size.
 *
 * The default `MemoryStore` is neither. It only ever drops an entry inside
 * `getSession`, i.e. when that same session id is looked up again — so a login
 * that is started and never completed is never revisited and never freed.
 * `GET /auth/login` requires no authentication and writes a session, which made
 * 20,000 abandoned logins 20,000 permanent entries:
 *
 *   abandoned logins sent : 20000
 *   entries in MemoryStore: 20000
 *   evicted by store      : 0
 *
 * Entries here expire on their own clock, and a hard cap means the worst case
 * is that a flood evicts the oldest in-flight logins — those users see a failed
 * login and can retry, which beats the container being OOM-killed.
 */
export class BoundedTtlSessionStore extends Store {
  private readonly entries = new Map<
    string,
    { data: string; expiresAt: number }
  >();

  constructor(
    private readonly maxEntries = MAX_OAUTH_SESSIONS,
    private readonly ttlMs = OAUTH_SESSION_TTL_MS,
    private readonly now: () => number = Date.now,
  ) {
    super();
  }

  get size() {
    return this.entries.size;
  }

  get(
    sid: string,
    callback: (err: unknown, session?: SessionData | null) => void,
  ) {
    const entry = this.entries.get(sid);

    if (!entry) {
      setImmediate(callback, null, null);
      return;
    }

    if (entry.expiresAt <= this.now()) {
      this.entries.delete(sid);
      setImmediate(callback, null, null);
      return;
    }

    setImmediate(callback, null, JSON.parse(entry.data) as SessionData);
  }

  set(sid: string, session: SessionData, callback?: (err?: unknown) => void) {
    // Re-inserting moves the entry to the end of the Map, so iteration order
    // stays "least recently written first" and eviction drops the stalest.
    this.entries.delete(sid);
    this.entries.set(sid, {
      data: JSON.stringify(session),
      expiresAt: this.expiresAt(session),
    });

    this.enforceLimit();

    if (callback) setImmediate(callback);
  }

  touch(sid: string, session: SessionData, callback?: (err?: unknown) => void) {
    const entry = this.entries.get(sid);

    if (entry) {
      entry.expiresAt = this.expiresAt(session);
    }

    if (callback) setImmediate(callback);
  }

  destroy(sid: string, callback?: (err?: unknown) => void) {
    this.entries.delete(sid);
    if (callback) setImmediate(callback);
  }

  clear(callback?: (err?: unknown) => void) {
    this.entries.clear();
    if (callback) setImmediate(callback);
  }

  length(callback: (err: unknown, length?: number) => void) {
    setImmediate(callback, null, this.entries.size);
  }

  private expiresAt(session: SessionData) {
    const expires = session.cookie?.expires;

    if (expires) {
      return new Date(expires).getTime();
    }

    return this.now() + this.ttlMs;
  }

  /**
   * Sweeping every entry on every write would be O(n) per login, so the sweep
   * only runs once the cap is actually reached. Expired entries are dropped
   * first because nobody can still be using them; only if that is not enough
   * does it start on live ones.
   */
  private enforceLimit() {
    if (this.entries.size <= this.maxEntries) return;

    const now = this.now();

    for (const [sid, entry] of this.entries) {
      if (this.entries.size <= this.maxEntries) break;
      if (entry.expiresAt <= now) this.entries.delete(sid);
    }

    for (const sid of this.entries.keys()) {
      if (this.entries.size <= this.maxEntries) break;
      this.entries.delete(sid);
    }
  }
}

/**
 * The cookie carrying this session id is what binds an OAuth callback to the
 * browser that started the flow — if it does not come back, the `state` check
 * cannot be made. It was previously configured with express-session's
 * defaults, which means no `secure` and no `sameSite`.
 *
 * `sameSite: "lax"` rather than `"strict"`: the callback is a top-level GET
 * navigation from the identity provider, which is cross-site, and strict would
 * withhold the cookie and break every login.
 */
export function oauthSessionOptions(
  secret: string,
  isProduction: boolean,
): SessionOptions {
  return {
    secret,
    resave: false,
    saveUninitialized: false,
    store: new BoundedTtlSessionStore(),
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: OAUTH_SESSION_TTL_MS,
    },
  };
}
