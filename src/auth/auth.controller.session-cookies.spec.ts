import { ConfigService } from "@nestjs/config";
import { Response } from "express";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { UsersService } from "../users/services";

/**
 * Every login path writes the same pair of cookies, and both logout paths clear
 * them with the same options — clearing only works when the options match what
 * was written. The endpoints used to spell all of that out one by one; these
 * tests are what says the shared version still behaves the same on each of
 * them.
 */
describe("AuthController session cookies", () => {
  const accessCookieOptions = { httpOnly: true, maxAge: 1000 };
  const refreshCookieOptions = { httpOnly: true, maxAge: 2000, path: "/auth" };

  const user = { id: "user-1" } as any;

  let cookies: Array<[string, string, unknown]>;
  let cleared: Array<[string, unknown]>;
  let headers: Record<string, string>;
  let res: Response;

  const authService = {
    getAccessToken: jest.fn(() => "access-token"),
    getRefreshToken: jest.fn(() => "refresh-token"),
    getAccessCookieOptions: jest.fn(() => accessCookieOptions),
    getRefreshCookieOptions: jest.fn(() => refreshCookieOptions),
    assertTrustedOrigin: jest.fn(),
  } as unknown as AuthService;

  const usersService = {
    ensureRefreshTokenId: jest.fn().mockResolvedValue(user),
    rotateRefreshTokenId: jest.fn().mockResolvedValue(undefined),
  } as unknown as UsersService;

  /** A callback request whose subject resolved to an existing user. */
  const callbackReq = () => ({
    user: { status: "existing", user },
    session: { destroy: jest.fn((cb?: () => void) => cb?.()) },
    cookies: {},
  });

  const configService = {
    get: jest.fn((key: string) =>
      key === "VIPPS_OIDC_POST_LOGIN_REDIRECT_URI"
        ? "https://peoply.app/vipps"
        : key === "GOOGLE_OIDC_POST_LOGIN_REDIRECT_URI"
          ? "https://peoply.app/google"
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
    /* clearAllMocks clears calls but keeps implementations, so the two tests
       that install their own would otherwise leak into the ones after them. */
    (authService.assertTrustedOrigin as jest.Mock).mockImplementation(
      () => undefined,
    );
    (configService.get as jest.Mock).mockImplementation((key: string) =>
      key === "VIPPS_OIDC_POST_LOGIN_REDIRECT_URI"
        ? "https://peoply.app/vipps"
        : key === "GOOGLE_OIDC_POST_LOGIN_REDIRECT_URI"
          ? "https://peoply.app/google"
          : undefined,
    );
    (usersService.ensureRefreshTokenId as jest.Mock).mockResolvedValue(user);
    cookies = [];
    cleared = [];
    headers = {};
    res = {
      cookie: (name: string, value: string, options: unknown) => {
        cookies.push([name, value, options]);
        return res;
      },
      clearCookie: (name: string, options: unknown) => {
        cleared.push([name, options]);
        return res;
      },
      set: (name: string, value: string) => {
        headers[name] = value;
        return res;
      },
      redirect: jest.fn(),
      sendStatus: jest.fn(),
    } as unknown as Response;
  });

  const expectSessionCookies = () => {
    expect(cookies).toEqual(
      expect.arrayContaining([
        ["access", "access-token", accessCookieOptions],
        ["refresh", "refresh-token", refreshCookieOptions],
      ]),
    );
    expect(cookies).toHaveLength(2);
    // Without these the browser drops the cookies on the cross-site callback.
    expect(headers).toEqual({
      "Access-Control-Allow-Credentials": "true",
      Credentials: "true",
    });
  };

  it("sets both cookies on the Vipps callback", async () => {
    await controller.loginCallback(callbackReq(), res);

    expectSessionCookies();
    expect(res.redirect).toHaveBeenCalledWith("https://peoply.app/vipps");
  });

  it("sets both cookies on the Google callback", async () => {
    await controller.loginGoogleCallback(callbackReq(), res);

    expectSessionCookies();
    expect(res.redirect).toHaveBeenCalledWith("https://peoply.app/google");
  });

  it("redirects to the empty string when the provider has no redirect configured", async () => {
    (configService.get as jest.Mock).mockReturnValue(undefined);

    await controller.loginCallback(callbackReq(), res);

    expect(res.redirect).toHaveBeenCalledWith("");
  });

  it("drops the passport session cookie on the way out of a callback", async () => {
    await controller.loginCallback(callbackReq(), res);

    expect(cleared).toEqual([["connect.sid", undefined]]);
  });

  it("sets both cookies on refresh", async () => {
    await controller.refresh({ user, headers: {} }, res);

    expectSessionCookies();
    expect(res.sendStatus).toHaveBeenCalledWith(200);
  });

  it("refuses to refresh from an untrusted origin", async () => {
    (authService.assertTrustedOrigin as jest.Mock).mockImplementation(() => {
      throw new Error("untrusted");
    });

    await expect(
      controller.refresh({ user, headers: {} }, res),
    ).rejects.toThrow("untrusted");

    expect(cookies).toEqual([]);
  });

  /* clearCookie only removes a cookie when name and options match the ones it
     was written with. The refresh cookie's `path: "/auth"` is the part that
     goes wrong if the two sides ever drift. */
  it("clears both cookies with the options they were written with", async () => {
    await controller.logout({ user, headers: {} }, res);

    expect(cleared).toEqual(
      expect.arrayContaining([
        ["access", accessCookieOptions],
        ["refresh", refreshCookieOptions],
      ]),
    );
    expect(usersService.rotateRefreshTokenId).toHaveBeenCalledWith("user-1");
    expect(res.sendStatus).toHaveBeenCalledWith(200);
  });
});
