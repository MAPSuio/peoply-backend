import { NotFoundException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Response } from "express";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { EmailLoginService } from "./email-login.service";
import { UsersService } from "../users/services";

describe("AuthController email login", () => {
  const user = { id: "user-1", refreshTokenId: "secret-id" } as any;

  let cookies: string[];
  let res: Response;

  const authService = {
    getAccessToken: jest.fn(() => "access-token"),
    getRefreshToken: jest.fn(() => "refresh-token"),
    getAccessCookieOptions: jest.fn(() => ({})),
    getRefreshCookieOptions: jest.fn(() => ({})),
    getSessionMarkerCookieOptions: jest.fn(() => ({})),
    assertTrustedOrigin: jest.fn(),
  } as unknown as AuthService;

  const usersService = {
    ensureRefreshTokenId: jest.fn().mockResolvedValue(user),
  } as unknown as UsersService;

  const emailLogin = {
    isEnabled: jest.fn(),
    requestLinkInBackground: jest.fn(),
    consume: jest.fn(),
  };

  const controller = new AuthController(
    authService,
    {} as ConfigService,
    usersService,
    {} as any,
    emailLogin as unknown as EmailLoginService,
  );

  const req = { headers: { origin: "https://peoply.app" } } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    emailLogin.isEnabled.mockReturnValue(true);
    cookies = [];
    res = {
      cookie: jest.fn((name: string) => {
        cookies.push(name);
        return res;
      }),
      set: jest.fn(),
    } as unknown as Response;
  });

  describe("POST /email/request", () => {
    it("is not there while the flag is off", async () => {
      emailLogin.isEnabled.mockReturnValue(false);

      await expect(
        controller.requestEmailLogin(req, { email: "a@example.com" }),
      ).rejects.toThrow(NotFoundException);
      expect(emailLogin.requestLinkInBackground).not.toHaveBeenCalled();
    });

    it("checks the origin and answers the same whether or not the email exists", async () => {
      await expect(
        controller.requestEmailLogin(req, { email: "a@example.com" }),
      ).resolves.toEqual({});
      expect(authService.assertTrustedOrigin).toHaveBeenCalledWith(req.headers);
      expect(emailLogin.requestLinkInBackground).toHaveBeenCalledWith(
        "a@example.com",
      );
    });
  });

  describe("POST /email/verify", () => {
    it("is not there while the flag is off", async () => {
      emailLogin.isEnabled.mockReturnValue(false);

      await expect(
        controller.verifyEmailLogin(req, { token: "t" }, res),
      ).rejects.toThrow(NotFoundException);
      expect(emailLogin.consume).not.toHaveBeenCalled();
    });

    it("issues the session cookies for the link's user", async () => {
      emailLogin.consume.mockResolvedValue(user.id);

      const body = await controller.verifyEmailLogin(req, { token: "t" }, res);

      expect(authService.assertTrustedOrigin).toHaveBeenCalledWith(req.headers);
      expect(usersService.ensureRefreshTokenId).toHaveBeenCalledWith(user.id);
      expect(cookies).toEqual(expect.arrayContaining(["access", "refresh"]));
      expect(body.user).not.toHaveProperty("refreshTokenId");
    });

    it("refuses an invalid link without setting cookies", async () => {
      emailLogin.consume.mockResolvedValue(null);

      await expect(
        controller.verifyEmailLogin(req, { token: "t" }, res),
      ).rejects.toThrow(UnauthorizedException);
      expect(cookies).toEqual([]);
    });
  });
});
