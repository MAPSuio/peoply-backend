/* openid-client v6 ships ESM only, which this jest setup cannot transform —
   importing it for real fails before a single test runs, which is why the
   strategies had no tests at all before the mocks. Only the base class and
   the module functions validate() reaches are needed here. */
jest.mock("openid-client/passport", () => ({
  Strategy: class {},
}));
jest.mock("openid-client", () => ({
  discovery: jest.fn(),
  fetchUserInfo: jest.fn(),
}));

import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as client from "openid-client";
import { Provider } from "../../generated/prisma/client";
import { UsersService } from "../../users/services";
import { GoogleStrategy } from "./google.strategy";
import type { OidcTokens } from "./oidc";
import { VippsStrategy } from "./vipps.strategy";

/**
 * `validate` is what turns a set of claims from the provider into a user, so
 * the checks in it are the whole of what stops a login from someone the
 * provider never confirmed.
 *
 * Since account linking, validate() no longer creates users: it resolves the
 * subject to either the existing user or a "new identity" carrying the
 * profile, and the callback decides what that identity becomes — a login, a
 * link onto the session user, or a pending link behind the confirm modal.
 */
describe("OIDC strategies", () => {
  const configService = {
    get: jest.fn(() => "configured"),
    getOrThrow: jest.fn(() => "configured"),
  } as unknown as ConfigService;

  const config = {} as client.Configuration;

  /** What the v6 passport strategy hands validate(). */
  const tokens = {
    access_token: "access-token",
    claims: () => ({ sub: "sub-1" }),
  } as unknown as OidcTokens;

  let userService: UsersService;
  let existingUser: unknown;

  const userinfoWith = (userinfo: Record<string, unknown>) => {
    (client.fetchUserInfo as jest.Mock).mockResolvedValue({
      sub: "sub-1",
      ...userinfo,
    });
  };

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

  const google = (claims: Record<string, unknown>) => {
    userinfoWith(claims);
    return new GoogleStrategy(config, userService, configService);
  };

  const vipps = (claims: Record<string, unknown>) => {
    userinfoWith(claims);
    return new VippsStrategy(config, userService, configService);
  };

  describe("GoogleStrategy", () => {
    it("resolves an unknown subject to a new identity without creating a user", async () => {
      await expect(google(googleClaims).validate(tokens)).resolves.toEqual({
        status: "new",
        provider: Provider.GOOGLE,
        sub: "sub-1",
        profile: {
          email: "ola@example.com",
          firstName: "Ola",
          lastName: "Nordmann",
        },
      });
      expect(userService.create).not.toHaveBeenCalled();
    });

    it("resolves a known subject to the existing user", async () => {
      existingUser = { id: "user-1" };

      await expect(google(googleClaims).validate(tokens)).resolves.toEqual({
        status: "existing",
        user: { id: "user-1" },
      });
      expect(userService.create).not.toHaveBeenCalled();
    });

    /* Anyone able to create a Google account against someone else's address
       could otherwise sign in as them. */
    it("refuses an unverified email", async () => {
      await expect(
        google({ ...googleClaims, email_verified: false }).validate(tokens),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(userService.create).not.toHaveBeenCalled();
    });

    it.each(["email", "given_name", "family_name"])(
      "refuses a login missing %s",
      async (claim) => {
        await expect(
          google({ ...googleClaims, [claim]: undefined }).validate(tokens),
        ).rejects.toThrow("Missing user info");
      },
    );

    /* A token response without an ID token has no verified subject to fetch
       userinfo for - v5 threw inside client.userinfo, v6 must still refuse. */
    it("refuses a token response without an ID token", async () => {
      const strategy = google(googleClaims);

      await expect(
        strategy.validate({
          access_token: "access-token",
          claims: () => undefined,
        } as unknown as OidcTokens),
      ).rejects.toThrow("no ID token subject");

      expect(userService.create).not.toHaveBeenCalled();
    });
  });

  describe("VippsStrategy", () => {
    it("resolves an unknown subject to a new identity without creating a user", async () => {
      await expect(vipps(vippsClaims).validate(tokens)).resolves.toEqual({
        status: "new",
        provider: Provider.VIPPS,
        sub: "sub-1",
        profile: {
          email: "ola@example.com",
          phone: "+4712345678",
          firstName: "Ola",
          lastName: "Nordmann",
          birthDate: new Date("1995-06-01").toISOString(),
        },
      });
      expect(userService.create).not.toHaveBeenCalled();
    });

    it("resolves a known subject to the existing user", async () => {
      existingUser = { id: "user-1" };

      await expect(vipps(vippsClaims).validate(tokens)).resolves.toEqual({
        status: "existing",
        user: { id: "user-1" },
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
        vipps({ ...vippsClaims, [claim]: undefined }).validate(tokens),
      ).rejects.toThrow("Missing user info");
    });
  });
});
