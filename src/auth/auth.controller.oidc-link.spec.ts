import { ConfigService } from "@nestjs/config";
import { Response } from "express";
import { Provider } from "../generated/prisma/client";
import { UsersService } from "../users/services";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

/**
 * The OIDC callbacks no longer receive a user: they receive a resolution —
 * either the existing user for the subject, or a "new identity" whose fate
 * the callback decides. These tests are the branch table for that decision:
 * plain login, first-time signup, the pending-link handshake behind the
 * confirm modal, and settings-initiated linking. Getting a branch wrong
 * either strands a user or links an identity onto an account nobody proved
 * they own, so every branch also asserts what did NOT happen.
 */
describe("AuthController OIDC callback linking", () => {
  const accessCookieOptions = { httpOnly: true, maxAge: 1000 };
  const refreshCookieOptions = { httpOnly: true, maxAge: 2000, path: "/auth" };

  const user = { id: "user-1" } as any;

  const googleProfile = {
    email: "ola@example.com",
    firstName: "Ola",
    lastName: "Nordmann",
  };

  const vippsProfile = {
    ...googleProfile,
    phone: "+4712345678",
    birthDate: new Date("1995-06-01").toISOString(),
  };

  const newGoogleIdentity = {
    status: "new",
    provider: Provider.GOOGLE,
    sub: "sub-g",
    profile: googleProfile,
  };

  const newVippsIdentity = {
    status: "new",
    provider: Provider.VIPPS,
    sub: "sub-v",
    profile: vippsProfile,
  };

  let cookies: Array<[string, string, unknown]>;
  let cleared: Array<[string, unknown]>;
  let res: Response;
  let session: any;

  const authService = {
    getAccessToken: jest.fn(() => "access-token"),
    getRefreshToken: jest.fn(() => "refresh-token"),
    getAccessCookieOptions: jest.fn(() => accessCookieOptions),
    getRefreshCookieOptions: jest.fn(() => refreshCookieOptions),
    validateJWT: jest.fn(() => ({ sub: "linker-1" })),
  } as unknown as AuthService;

  const usersService = {
    ensureRefreshTokenId: jest.fn().mockResolvedValue(user),
    findByEmail: jest.fn().mockResolvedValue(null),
    findByPhone: jest.fn().mockResolvedValue(null),
    findById: jest.fn().mockResolvedValue({ id: "linker-1" }),
    create: jest.fn().mockResolvedValue(user),
    linkProvider: jest.fn().mockResolvedValue(undefined),
    getLinkedProviders: jest
      .fn()
      .mockResolvedValue([{ provider: Provider.VIPPS, createdAt: new Date() }]),
  } as unknown as UsersService;

  const configService = {
    get: jest.fn((key: string) =>
      key === "VIPPS_OIDC_POST_LOGIN_REDIRECT_URI" ||
      key === "GOOGLE_OIDC_POST_LOGIN_REDIRECT_URI"
        ? "https://peoply.app/login/callback"
        : undefined,
    ),
  } as unknown as ConfigService;

  const controller = new AuthController(
    authService,
    configService,
    usersService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    (authService.validateJWT as jest.Mock).mockImplementation(() => ({
      sub: "linker-1",
    }));
    (usersService.ensureRefreshTokenId as jest.Mock).mockResolvedValue(user);
    (usersService.findByEmail as jest.Mock).mockResolvedValue(null);
    (usersService.findByPhone as jest.Mock).mockResolvedValue(null);
    (usersService.findById as jest.Mock).mockResolvedValue({ id: "linker-1" });
    (usersService.create as jest.Mock).mockResolvedValue(user);
    (usersService.getLinkedProviders as jest.Mock).mockResolvedValue([
      { provider: Provider.VIPPS, createdAt: new Date() },
    ]);
    cookies = [];
    cleared = [];
    session = { destroy: jest.fn((cb?: () => void) => cb?.()) };
    res = {
      cookie: (name: string, value: string, options: unknown) => {
        cookies.push([name, value, options]);
        return res;
      },
      clearCookie: (name: string, options: unknown) => {
        cleared.push([name, options]);
        return res;
      },
      set: () => res,
      redirect: jest.fn(),
    } as unknown as Response;
  });

  const redirectedTo = () => (res.redirect as jest.Mock).mock.calls[0][0];

  const sessionCookiesIssued = () =>
    cookies.some(([name]) => name === "access") &&
    cookies.some(([name]) => name === "refresh");

  describe("plain login (no intent, no pending link)", () => {
    it("logs an existing user in unchanged", async () => {
      await controller.loginCallback(
        { user: { status: "existing", user }, session, cookies: {} },
        res,
      );

      expect(sessionCookiesIssued()).toBe(true);
      expect(redirectedTo()).toBe("https://peoply.app/login/callback");
      expect(usersService.linkProvider).not.toHaveBeenCalled();
    });

    it("creates a user for a new identity with no conflicts", async () => {
      await controller.loginGoogleCallback(
        { user: newGoogleIdentity, session, cookies: {} },
        res,
      );

      expect(usersService.create).toHaveBeenCalledWith(
        googleProfile,
        Provider.GOOGLE,
        "sub-g",
      );
      expect(sessionCookiesIssued()).toBe(true);
      expect(redirectedTo()).toBe("https://peoply.app/login/callback");
    });

    it("frees the oauth session once a login completes", async () => {
      await controller.loginCallback(
        { user: { status: "existing", user }, session, cookies: {} },
        res,
      );

      expect(session.destroy).toHaveBeenCalled();
      expect(cleared).toEqual(
        expect.arrayContaining([["connect.sid", undefined]]),
      );
    });
  });

  describe("email collision at login → pending link", () => {
    beforeEach(() => {
      (usersService.findByEmail as jest.Mock).mockResolvedValue({
        id: "matched-1",
      });
    });

    it("stores the pending link and prompts instead of creating or logging in", async () => {
      await controller.loginGoogleCallback(
        { user: newGoogleIdentity, session, cookies: {} },
        res,
      );

      expect(session.pendingLink).toEqual({
        provider: Provider.GOOGLE,
        sub: "sub-g",
        profile: googleProfile,
        matchedUserId: "matched-1",
      });
      expect(usersService.create).not.toHaveBeenCalled();
      expect(sessionCookiesIssued()).toBe(false);
      expect(redirectedTo()).toBe(
        "https://peoply.app/login/callback?link_prompt=GOOGLE&link_with=VIPPS",
      );
    });

    /* The session cookie is the only thing carrying the pending link through
       the confirm re-auth — destroying it here breaks the whole handshake. */
    it("keeps the oauth session alive for the confirm round trip", async () => {
      await controller.loginGoogleCallback(
        { user: newGoogleIdentity, session, cookies: {} },
        res,
      );

      expect(session.destroy).not.toHaveBeenCalled();
      expect(cleared).toEqual([]);
    });

    it("reports a phone-only collision instead of creating a duplicate", async () => {
      (usersService.findByEmail as jest.Mock).mockResolvedValue(null);
      (usersService.findByPhone as jest.Mock).mockResolvedValue({
        id: "phone-owner",
      });

      await controller.loginCallback(
        { user: newVippsIdentity, session, cookies: {} },
        res,
      );

      expect(usersService.create).not.toHaveBeenCalled();
      expect(sessionCookiesIssued()).toBe(false);
      expect(redirectedTo()).toBe(
        "https://peoply.app/login/callback?link_error=phone_in_use",
      );
    });
  });

  describe("confirm re-auth (pending link in session)", () => {
    const pending = {
      provider: Provider.GOOGLE,
      sub: "sub-g",
      profile: googleProfile,
      matchedUserId: "user-1",
    };

    it("links the pending identity when the matched user logs back in", async () => {
      session.pendingLink = { ...pending };

      await controller.loginCallback(
        { user: { status: "existing", user }, session, cookies: {} },
        res,
      );

      expect(usersService.linkProvider).toHaveBeenCalledWith(
        "user-1",
        Provider.GOOGLE,
        "sub-g",
        googleProfile,
      );
      expect(sessionCookiesIssued()).toBe(true);
      expect(redirectedTo()).toBe(
        "https://peoply.app/login/callback?linked=GOOGLE",
      );
    });

    /* Whoever re-authenticated owns the account they logged into — never
       refuse them their own session just because the link failed. */
    it("refuses the link but still logs in when a different user confirms", async () => {
      session.pendingLink = { ...pending, matchedUserId: "someone-else" };

      await controller.loginCallback(
        { user: { status: "existing", user }, session, cookies: {} },
        res,
      );

      expect(usersService.linkProvider).not.toHaveBeenCalled();
      expect(sessionCookiesIssued()).toBe(true);
      expect(redirectedTo()).toBe(
        "https://peoply.app/login/callback?link_error=wrong_user",
      );
    });
  });

  describe("settings-initiated linking (link intent in session)", () => {
    beforeEach(() => {
      session.linkUserId = "linker-1";
    });

    const linkRequest = (resolution: unknown) => ({
      user: resolution,
      session,
      cookies: { access: "access-cookie" },
    });

    it("links a new identity onto the session user without issuing cookies", async () => {
      await controller.loginGoogleCallback(linkRequest(newGoogleIdentity), res);

      expect(usersService.linkProvider).toHaveBeenCalledWith(
        "linker-1",
        Provider.GOOGLE,
        "sub-g",
        googleProfile,
      );
      expect(sessionCookiesIssued()).toBe(false);
      expect(redirectedTo()).toBe(
        "https://peoply.app/login/callback?linked=GOOGLE",
      );
    });

    it("consumes the intent so the next login is a plain login", async () => {
      await controller.loginGoogleCallback(linkRequest(newGoogleIdentity), res);

      expect(session.linkUserId).toBeUndefined();
    });

    it("reports in_use when the identity already belongs to another user", async () => {
      await controller.loginGoogleCallback(
        linkRequest({ status: "existing", user: { id: "someone-else" } }),
        res,
      );

      expect(usersService.linkProvider).not.toHaveBeenCalled();
      expect(redirectedTo()).toBe(
        "https://peoply.app/login/callback?link_error=in_use",
      );
    });

    it("treats re-linking an identity I already own as success", async () => {
      await controller.loginGoogleCallback(
        linkRequest({ status: "existing", user: { id: "linker-1" } }),
        res,
      );

      expect(usersService.linkProvider).not.toHaveBeenCalled();
      expect(redirectedTo()).toBe(
        "https://peoply.app/login/callback?linked=GOOGLE",
      );
    });

    /* The intent was written by an authenticated request, but the callback
       arrives later — the access cookie must still prove the same user, or
       an attacker rushing a victim's browser through /auth/callback could
       attach their own identity to the victim's intent. */
    it("refuses the link when the access cookie no longer matches the intent", async () => {
      (authService.validateJWT as jest.Mock).mockImplementation(() => {
        throw new Error("expired");
      });

      await controller.loginGoogleCallback(linkRequest(newGoogleIdentity), res);

      expect(usersService.linkProvider).not.toHaveBeenCalled();
      expect(redirectedTo()).toBe(
        "https://peoply.app/login/callback?link_error=expired",
      );
    });
  });
});
