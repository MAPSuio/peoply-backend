/* openid-client reaches jose, which ships ESM that this jest setup cannot
   transform — importing it for real fails before a single test runs, which is
   why the strategies had no tests at all. Only the base class and the
   discovery entry point are needed here; validate() talks to the client it was
   handed, and that one is a stub either way. */
jest.mock("openid-client", () => ({
  Strategy: class {
    constructor(..._args: unknown[]) {}
  },
  Issuer: { discover: jest.fn() },
}));

import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Client } from "openid-client";
import { Provider } from "../../generated/prisma/client";
import { UsersService } from "../../users/services";
import { GoogleStrategy } from "./google.strategy";
import { VippsStrategy } from "./vipps.strategy";

/**
 * `validate` is what turns a set of claims from the provider into a user, so
 * the checks in it are the whole of what stops a login from someone the
 * provider never confirmed.
 */
describe("OIDC strategies", () => {
  const configService = {
    get: jest.fn(() => "configured"),
  } as unknown as ConfigService;

  let userService: UsersService;
  let existingUser: unknown;

  const clientWith = (userinfo: Record<string, unknown>) =>
    ({
      userinfo: jest.fn().mockResolvedValue({ sub: "sub-1", ...userinfo }),
    }) as unknown as Client;

  beforeEach(() => {
    existingUser = null;
    userService = {
      findByProviderSub: jest.fn(async () => existingUser),
      create: jest.fn(async (dto: unknown) => ({ id: "new-user", dto })),
    } as unknown as UsersService;
  });

  const googleClaims = {
    email: "ola@example.com",
    email_verified: true,
    given_name: "Ola",
    family_name: "Nordmann",
  };

  const vippsClaims = {
    email: "ola@example.com",
    phone_number: "+4712345678",
    given_name: "Ola",
    family_name: "Nordmann",
    birthdate: "1995-06-01",
  };

  const google = (claims: Record<string, unknown>) =>
    new GoogleStrategy(clientWith(claims), userService, configService);

  const vipps = (claims: Record<string, unknown>) =>
    new VippsStrategy(clientWith(claims), userService, configService);

  describe("GoogleStrategy", () => {
    it("creates a user on first login", async () => {
      await google(googleClaims).validate({} as any);

      expect(userService.create).toHaveBeenCalledWith(
        {
          email: "ola@example.com",
          firstName: "Ola",
          lastName: "Nordmann",
        },
        Provider.GOOGLE,
        "sub-1",
      );
    });

    it("returns the existing user without creating another", async () => {
      existingUser = { id: "user-1" };

      await expect(google(googleClaims).validate({} as any)).resolves.toEqual({
        id: "user-1",
      });
      expect(userService.create).not.toHaveBeenCalled();
    });

    /* Anyone able to create a Google account against someone else's address
       could otherwise sign in as them. */
    it("refuses an unverified email", async () => {
      await expect(
        google({ ...googleClaims, email_verified: false }).validate({} as any),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(userService.create).not.toHaveBeenCalled();
    });

    it.each(["email", "given_name", "family_name"])(
      "refuses a login missing %s",
      async (claim) => {
        await expect(
          google({ ...googleClaims, [claim]: undefined }).validate({} as any),
        ).rejects.toThrow("Missing user info");
      },
    );
  });

  describe("VippsStrategy", () => {
    it("creates a user on first login", async () => {
      await vipps(vippsClaims).validate({} as any);

      expect(userService.create).toHaveBeenCalledWith(
        {
          email: "ola@example.com",
          phone: "+4712345678",
          firstName: "Ola",
          lastName: "Nordmann",
          birthDate: new Date("1995-06-01").toISOString(),
        },
        Provider.VIPPS,
        "sub-1",
      );
    });

    it("returns the existing user without creating another", async () => {
      existingUser = { id: "user-1" };

      await expect(vipps(vippsClaims).validate({} as any)).resolves.toEqual({
        id: "user-1",
      });
      expect(userService.create).not.toHaveBeenCalled();
    });

    // Both are required columns for a Vipps user, unlike for a Google one.
    it.each([
      "email",
      "phone_number",
      "given_name",
      "family_name",
      "birthdate",
    ])("refuses a login missing %s", async (claim) => {
      await expect(
        vipps({ ...vippsClaims, [claim]: undefined }).validate({} as any),
      ).rejects.toThrow("Missing user info");
    });
  });
});
