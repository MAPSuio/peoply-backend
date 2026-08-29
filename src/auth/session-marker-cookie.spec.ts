import { AuthService } from "./auth.service";

describe("session marker cookie", () => {
  const build = (config: Record<string, unknown>) =>
    new AuthService(
      {} as any,
      {
        get: (key: string) => config[key],
      } as any,
    );

  const productionConfig = {
    CORS_ORIGIN: "https://peoply.app",
    JWT_REFRESH_TOKEN_EXP_TIME: 604800,
    SESSION_COOKIE_DOMAIN: ".peoply.app",
  };

  it("is readable by the frontend, unlike the session cookies themselves", () => {
    const service = build(productionConfig);

    expect(service.getSessionMarkerCookieOptions().httpOnly).toBe(false);
  });

  it("keeps the transport rules the session cookies use", () => {
    const service = build(productionConfig);

    const options = service.getSessionMarkerCookieOptions();

    expect(options.secure).toBe(true);
    expect(options.sameSite).toBe("none");
  });

  it("expires with the refresh token, so it never outlives the session", () => {
    const service = build(productionConfig);

    expect(service.getSessionMarkerCookieOptions().maxAge).toBe(604800 * 1000);
  });

  it("is scoped to the domain the frontend and the api share", () => {
    const service = build(productionConfig);

    expect(service.getSessionMarkerCookieOptions().domain).toBe(".peoply.app");
  });

  it.each([undefined, ""])(
    "stays host-only when the shared domain is %p",
    (domain) => {
      const service = build({
        CORS_ORIGIN: "http://localhost:3001",
        JWT_REFRESH_TOKEN_EXP_TIME: 604800,
        LOCAL_AUTH_ENABLED: true,
        SESSION_COOKIE_DOMAIN: domain,
      });

      expect(service.getSessionMarkerCookieOptions().domain).toBeUndefined();
    },
  );
});
