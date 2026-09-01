import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import { ModeratorGuard } from "./moderator.guard";

describe("ModeratorGuard", () => {
  const accessSession = { userFromRequest: jest.fn() } as any;

  let guard: ModeratorGuard;

  const makeContext = (accessCookie: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ cookies: { access: accessCookie } }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new ModeratorGuard(accessSession);
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
    accessSession.userFromRequest.mockResolvedValueOnce({
      email: "Admin@Peoply.App",
    });

    await expect(guard.canActivate(makeContext("token"))).resolves.toBe(true);
  });

  it("throws ForbiddenException when user email is not in allowlist", async () => {
    process.env.MODERATOR_EMAILS = "admin@peoply.app";
    accessSession.userFromRequest.mockResolvedValueOnce({
      email: "hacker@evil.com",
    });

    await expect(guard.canActivate(makeContext("token"))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("throws UnauthorizedException when the session resolves no user", async () => {
    process.env.MODERATOR_EMAILS = "admin@peoply.app";
    accessSession.userFromRequest.mockRejectedValueOnce(
      new UnauthorizedException(),
    );

    await expect(guard.canActivate(makeContext("token"))).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
