import { AuthService } from "./auth.service";

/* `Secure` used to be decided by LOCAL_AUTH_ENABLED, so an https environment
   with the dev-login flag on issued session cookies without it. */
describe("AuthService cookie security", () => {
  const build = (config: Record<string, unknown>) =>
    new AuthService({} as any, {
      get: (key: string) => config[key],
    } as any);

  /* baseCookieOptions is private and only observable through the cookies the
     service hands out; getAccessTokenCookie is the cheapest way in. */
  const options = (service: AuthService) =>
    (service as any).baseCookieOptions();

  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  describe("with local auth enabled outside production", () => {
    beforeEach(() => {
      process.env.NODE_ENV = "development";
    });

    it("keeps Secure when the accepted origin is https", () => {
      const service = build({
        LOCAL_AUTH_ENABLED: true,
        CORS_ORIGIN: "https://staging.peoply.app",
      });

      expect(options(service)).toEqual({
        sameSite: "none",
        httpOnly: true,
        secure: true,
      });
    });

    it("drops Secure only for a plaintext localhost origin", () => {
      const service = build({
        LOCAL_AUTH_ENABLED: true,
        CORS_ORIGIN: "http://localhost:3001",
      });

      /* Secure on http://localhost stops the cookie being stored at all, so
         local development genuinely needs this branch. */
      expect(options(service)).toEqual({
        sameSite: "lax",
        httpOnly: true,
        secure: false,
      });
    });

    it("keeps Secure when any accepted origin is https", () => {
      const service = build({
        LOCAL_AUTH_ENABLED: true,
        CORS_ORIGIN: "http://localhost:3001,https://preview.peoply.app",
      });

      expect(options(service).secure).toBe(true);
    });

    it("keeps Secure when no origin is configured at all", () => {
      const service = build({ LOCAL_AUTH_ENABLED: true });

      expect(options(service).secure).toBe(true);
    });
  });

  it("is always Secure in production", () => {
    process.env.NODE_ENV = "production";
    const service = build({
      LOCAL_AUTH_ENABLED: true,
      CORS_ORIGIN: "http://localhost:3001",
    });

    expect(options(service)).toEqual({
      sameSite: "none",
      httpOnly: true,
      secure: true,
    });
  });

  it("is always Secure when local auth is off", () => {
    process.env.NODE_ENV = "development";
    const service = build({
      LOCAL_AUTH_ENABLED: false,
      CORS_ORIGIN: "http://localhost:3001",
    });

    expect(options(service).secure).toBe(true);
  });

  it("marks the cookies httpOnly in every case", () => {
    process.env.NODE_ENV = "development";

    for (const CORS_ORIGIN of ["http://localhost:3001", "https://x.test"]) {
      const service = build({ LOCAL_AUTH_ENABLED: true, CORS_ORIGIN });
      expect(options(service).httpOnly).toBe(true);
    }
  });
});
