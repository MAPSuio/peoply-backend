import { JwtService } from "@nestjs/jwt";
import { AuthService } from "./auth.service";
import { AccessSessionService } from "./access-session.service";

const ACCESS_SECRET = "access-secret";

describe("access token claims", () => {
  const jwtService = new JwtService({ secret: ACCESS_SECRET });
  const configService = { get: () => undefined } as never;
  const authService = new AuthService(jwtService, configService);

  const user = { id: "user-1", refreshTokenId: "session-1" };

  it("names the user and the session the token was minted for", () => {
    const token = authService.getAccessToken(user as never);

    expect(jwtService.verify(token)).toMatchObject({
      sub: "user-1",
      sid: "session-1",
    });
  });

  it("carries a session the validator accepts while it is current", async () => {
    const token = authService.getAccessToken(user as never);
    const accessSession = new AccessSessionService(jwtService, {
      findById: async () => user,
    } as never);

    await expect(
      accessSession.userFromRequest({ cookies: { access: token } }),
    ).resolves.toBe(user);
  });

  it("carries a session the validator refuses once it is rotated away", async () => {
    const token = authService.getAccessToken(user as never);
    const accessSession = new AccessSessionService(jwtService, {
      findById: async () => ({ ...user, refreshTokenId: "session-2" }),
    } as never);

    await expect(
      accessSession.userFromRequest({ cookies: { access: token } }),
    ).rejects.toThrow();
  });
});
