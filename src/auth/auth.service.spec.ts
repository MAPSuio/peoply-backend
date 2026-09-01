jest.mock("@nestjs/jwt", () => ({
  JwtService: class JwtService {},
}));

import { AuthService } from "./auth.service";

describe("AuthService", () => {
  let localAuthEnabled = false;
  /* Cookie security follows the scheme of the origins we accept, so a test
     about localhost has to say so rather than leaving production's origin in
     place - LOCAL_AUTH_ENABLED on its own no longer relaxes the cookies. */
  let corsOrigin = "https://peoply.app";

  const configService = {
    get: jest.fn((key: string) => {
      switch (key) {
        case "JWT_ACCESS_TOKEN_EXP_TIME":
          return 900;
        case "JWT_REFRESH_TOKEN_EXP_TIME":
          return 604800;
        case "LOCAL_AUTH_ENABLED":
          return localAuthEnabled;
        case "CORS_ORIGIN":
          return corsOrigin;
        default:
          return undefined;
      }
    }),
  } as any;

  const jwtService = {
    sign: jest.fn(),
    verify: jest.fn(),
  } as any;

  let service: AuthService;

  beforeEach(() => {
    localAuthEnabled = false;
    corsOrigin = "https://peoply.app";
    configService.get.mockClear();
    service = new AuthService(jwtService, configService);
  });

  it("names the session the access token was minted for", () => {
    service.getAccessToken({
      id: "user-1",
      refreshTokenId: "session-1",
    } as never);

    expect(jwtService.sign).toHaveBeenCalledWith({
      sub: "user-1",
      sid: "session-1",
    });
  });

  it("uses SameSite=None for access cookies", () => {
    expect(service.getAccessCookieOptions()).toMatchObject({
      sameSite: "none",
      httpOnly: true,
      secure: true,
      maxAge: 900000,
    });
  });

  it("uses SameSite=None for refresh cookies", () => {
    expect(service.getRefreshCookieOptions()).toMatchObject({
      sameSite: "none",
      httpOnly: true,
      secure: true,
      path: "/auth",
      maxAge: 604800000,
    });
  });

  it("uses localhost-safe cookies when local auth is enabled", () => {
    localAuthEnabled = true;
    corsOrigin = "http://localhost:3001";
    service = new AuthService(jwtService, configService);

    expect(service.getAccessCookieOptions()).toMatchObject({
      sameSite: "lax",
      httpOnly: true,
      secure: false,
      maxAge: 900000,
    });

    expect(service.getRefreshCookieOptions()).toMatchObject({
      sameSite: "lax",
      httpOnly: true,
      secure: false,
      path: "/auth",
      maxAge: 604800000,
    });
  });

  it("allows missing origin when explicitly configured", () => {
    expect(() =>
      service.assertTrustedOrigin({}, { allowMissingOrigin: true }),
    ).not.toThrow();
  });

  it("rejects missing origin by default", () => {
    expect(() => service.assertTrustedOrigin({})).toThrow("Untrusted origin");
  });
});
