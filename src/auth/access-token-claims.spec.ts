import { JwtService } from "@nestjs/jwt";
import { AuthService } from "./auth.service";
import { AccessSessionService } from "./access-session.service";

const ACCESS_SECRET = "access-secret";

describe("access token claims", () => {
  const jwtService = new JwtService({ secret: ACCESS_SECRET });
  const configService = { get: () => undefined } as never;
  const authService = new AuthService(jwtService, configService);

  const user = { id: "user-1", refreshTokenId: "session-1" };

  function validatorSeeing(stored: typeof user | null) {
    return new AccessSessionService(jwtService, {
      findById: async (id: string) => (id === user.id ? stored : null),
    } as never);
  }

  const token = () => authService.getAccessToken(user as never);

  it("names the user and the session the token was minted for", () => {
    expect(jwtService.verify(token())).toMatchObject({
      sub: "user-1",
      sid: "session-1",
    });
  });

  it("carries a session the validator accepts while it is current", async () => {
    await expect(
      validatorSeeing(user).userFromRequest({ cookies: { access: token() } }),
    ).resolves.toMatchObject({ id: "user-1", refreshTokenId: "session-1" });
  });

  it("carries a session the validator refuses once it is rotated away", async () => {
    const rotated = { ...user, refreshTokenId: "session-2" };

    await expect(
      validatorSeeing(rotated).userFromRequest({
        cookies: { access: token() },
      }),
    ).rejects.toThrow();
  });

  it("refuses a request that brings no access cookie", async () => {
    await expect(
      validatorSeeing(user).userFromRequest({ cookies: {} }),
    ).rejects.toThrow();
  });

  it("refuses a token that is not a token", async () => {
    await expect(
      validatorSeeing(user).userFromRequest({
        cookies: { access: "not.a.token" },
      }),
    ).rejects.toThrow();
  });

  it("refuses a token signed for an account that no longer exists", async () => {
    const stranger = jwtService.sign({ sub: "user-9", sid: "session-1" });

    await expect(
      validatorSeeing(user).userFromRequest({ cookies: { access: stranger } }),
    ).rejects.toThrow();
  });
});
