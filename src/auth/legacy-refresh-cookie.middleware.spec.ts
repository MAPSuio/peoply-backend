jest.mock("@nestjs/jwt", () => ({
  JwtService: class JwtService {},
}));

import { AuthService } from "./auth.service";
import { LegacyRefreshCookieMiddleware } from "./legacy-refresh-cookie.middleware";

describe("LegacyRefreshCookieMiddleware", () => {
  const configService = {
    get: jest.fn(() => undefined),
  } as any;

  const authService = new AuthService({} as any, configService);
  const middleware = new LegacyRefreshCookieMiddleware(authService);

  it("expires the legacy /auth/refresh cookie and continues the chain", () => {
    const res = { clearCookie: jest.fn() } as any;
    const next = jest.fn();

    middleware.use({} as any, res, next);

    expect(res.clearCookie).toHaveBeenCalledWith("refresh", {
      path: "/auth/refresh",
      sameSite: "none",
      httpOnly: true,
      secure: true,
    });
    expect(next).toHaveBeenCalled();
  });
});
