import { UnauthorizedException } from "@nestjs/common";
import { AccessSessionService } from "./access-session.service";

const SESSION_ID = "session-1";

function makeService(user: unknown, verified: Record<string, unknown> | Error) {
  const jwtService = {
    verify: jest.fn(() => {
      if (verified instanceof Error) throw verified;
      return verified;
    }),
  };
  const usersService = { findById: jest.fn(async () => user) };

  return {
    service: new AccessSessionService(
      jwtService as never,
      usersService as never,
    ),
    jwtService,
    usersService,
  };
}

describe("AccessSessionService", () => {
  const user = { id: "user-1", refreshTokenId: SESSION_ID };

  it("resolves the user behind a token minted for the current session", async () => {
    const { service } = makeService(user, { sub: "user-1", sid: SESSION_ID });

    await expect(
      service.userFromRequest({ cookies: { access: "token" } }),
    ).resolves.toBe(user);
  });

  it("refuses a token minted before the session was rotated away", async () => {
    const { service } = makeService(user, {
      sub: "user-1",
      sid: "old-session",
    });

    await expect(
      service.userFromRequest({ cookies: { access: "token" } }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("refuses a token from before sessions were pinned at all", async () => {
    const { service } = makeService(user, { sub: "user-1" });

    await expect(
      service.userFromRequest({ cookies: { access: "token" } }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("refuses a refresh token however it was signed", async () => {
    const { service, usersService } = makeService(user, {
      sub: "user-1",
      sid: SESSION_ID,
      tokenId: SESSION_ID,
    });

    await expect(
      service.userFromRequest({ cookies: { access: "token" } }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(usersService.findById).not.toHaveBeenCalled();
  });

  it("refuses a request without an access cookie", async () => {
    const { service, jwtService } = makeService(user, { sub: "user-1" });

    await expect(
      service.userFromRequest({ cookies: {} }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(jwtService.verify).not.toHaveBeenCalled();
  });

  it("refuses a token whose user is gone", async () => {
    const { service } = makeService(null, { sub: "user-1", sid: SESSION_ID });

    await expect(
      service.userFromRequest({ cookies: { access: "token" } }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("applies the same session rule to a payload passport already verified", async () => {
    const { service } = makeService(user, new Error("must not be called"));

    await expect(
      service.userFromPayload({ sub: "user-1", sid: "old-session" }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      service.userFromPayload({ sub: "user-1", sid: SESSION_ID }),
    ).resolves.toBe(user);
  });
});
