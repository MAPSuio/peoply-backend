jest.mock("../auth.service", () => ({
  AuthService: class AuthService {},
}));

import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { ModeratorGuard } from "./moderator.guard";

describe("ModeratorGuard", () => {
  const authService = { requireValidAccessToken: jest.fn() } as any;
  const usersService = { findById: jest.fn() } as any;

  let guard: ModeratorGuard;

  const makeContext = (accessCookie: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ cookies: { access: accessCookie } }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new ModeratorGuard(authService, usersService);
    delete process.env.MODERATOR_EMAILS;
  });

  it("throws ForbiddenException when MODERATOR_EMAILS is not set", async () => {
    await expect(guard.canActivate(makeContext("token"))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("throws ForbiddenException when MODERATOR_EMAILS is empty string", async () => {
    process.env.MODERATOR_EMAILS = "";
    await expect(guard.canActivate(makeContext("token"))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("allows access when user email is in allowlist", async () => {
    process.env.MODERATOR_EMAILS = "admin@peoply.app, mod@peoply.app";
    authService.requireValidAccessToken.mockReturnValueOnce({ sub: "user-1" });
    usersService.findById.mockResolvedValueOnce({ email: "Admin@Peoply.App" });

    await expect(guard.canActivate(makeContext("token"))).resolves.toBe(true);
  });

  it("throws ForbiddenException when user email is not in allowlist", async () => {
    process.env.MODERATOR_EMAILS = "admin@peoply.app";
    authService.requireValidAccessToken.mockReturnValueOnce({ sub: "user-1" });
    usersService.findById.mockResolvedValueOnce({ email: "hacker@evil.com" });

    await expect(guard.canActivate(makeContext("token"))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("throws ForbiddenException when user is not found", async () => {
    process.env.MODERATOR_EMAILS = "admin@peoply.app";
    authService.requireValidAccessToken.mockReturnValueOnce({ sub: "user-1" });
    usersService.findById.mockResolvedValueOnce(null);

    await expect(guard.canActivate(makeContext("token"))).rejects.toThrow(
      ForbiddenException,
    );
  });
});
