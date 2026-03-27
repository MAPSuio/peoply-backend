jest.mock("@nestjs/jwt", () => ({
  JwtService: class JwtService {},
}));

import { AuthService } from "./auth.service";

describe("AuthService", () => {
  const configService = {
    get: jest.fn((key: string) => {
      switch (key) {
        case "JWT_ACCESS_TOKEN_EXP_TIME":
          return 900;
        case "JWT_REFRESH_TOKEN_EXP_TIME":
          return 604800;
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
    configService.get.mockClear();
    service = new AuthService(jwtService, configService);
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
});
