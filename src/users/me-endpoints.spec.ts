import { AuthController } from "../auth/auth.controller";
import { UsersController } from "./users.controller";

/**
 * `AccessStrategy.validate` puts the whole `User` row on `req.user`, and both
 * of these handlers used to hand it straight back. The unit test on
 * `withoutRefreshTokenId` proves the helper is correct; this proves the two
 * endpoints actually call it, which is the part that regresses.
 */
const req = () => ({
  user: {
    id: "user-1",
    firstName: "Ada",
    email: "ada@example.com",
    refreshTokenId: "session-handle-abc",
  },
});

describe("endpoints that return the caller's own row", () => {
  const linkedProviders = [{ provider: "VIPPS", createdAt: new Date() }];

  const usersController = (overrides?: {
    userService?: unknown;
    authService?: unknown;
  }) =>
    new UsersController(
      {} as any,
      {} as any,
      (overrides?.userService ?? {
        getLinkedProviders: jest.fn().mockResolvedValue(linkedProviders),
      }) as any,
      {} as any,
      {} as any,
      {} as any,
      (overrides?.authService ?? {
        assertTrustedOrigin: jest.fn(),
      }) as any,
      {} as any,
      {
        getPermissions: jest
          .fn()
          .mockResolvedValue({ isAdmin: true, hasAdminAccess: true }),
      } as any,
    );

  it("GET /users/me omits refreshTokenId", async () => {
    const body: any = await usersController().me(req());

    expect(body).not.toHaveProperty("refreshTokenId");
    expect(body.email).toBe("ada@example.com");
    expect(body.isAdmin).toBe(true);
  });

  /* The settings page decides link/unlink affordances from this list; it must
     come from the self view only — PUBLIC_USER_SELECT stays provider-free. */
  it("GET /users/me lists the caller's linked providers", async () => {
    const body: any = await usersController().me(req());

    expect(body.providers).toEqual(linkedProviders);
  });

  it("DELETE /users/me/providers/:provider unlinks after the origin check", async () => {
    const userService = {
      getLinkedProviders: jest.fn(),
      unlinkProvider: jest.fn().mockResolvedValue(undefined),
    };
    const controller = usersController({ userService });

    await controller.unlinkProvider(
      { ...req(), headers: { origin: "https://peoply.app" } },
      "GOOGLE" as any,
    );

    expect(userService.unlinkProvider).toHaveBeenCalledWith("user-1", "GOOGLE");
  });

  /* Unlink is a state change on a cookie-authenticated endpoint: the origin
     check is the CSRF defence, same as logout and refresh. */
  it("DELETE /users/me/providers/:provider refuses an untrusted origin", async () => {
    const userService = {
      getLinkedProviders: jest.fn(),
      unlinkProvider: jest.fn(),
    };
    const controller = usersController({
      userService,
      authService: {
        assertTrustedOrigin: jest.fn(() => {
          throw new Error("untrusted");
        }),
      },
    });

    await expect(
      controller.unlinkProvider({ ...req(), headers: {} }, "GOOGLE" as any),
    ).rejects.toThrow("untrusted");
    expect(userService.unlinkProvider).not.toHaveBeenCalled();
  });

  it("GET /auth/user omits refreshTokenId", async () => {
    const controller = new AuthController({} as any, {} as any, {} as any);

    const body: any = await controller.user(req());

    expect(body.user).not.toHaveProperty("refreshTokenId");
    expect(body.user.email).toBe("ada@example.com");
  });
});
