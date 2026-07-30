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
  it("GET /users/me omits refreshTokenId", async () => {
    const controller = new UsersController(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const body: any = await controller.me(req());

    expect(body).not.toHaveProperty("refreshTokenId");
    expect(body.email).toBe("ada@example.com");
  });

  it("PATCH /users/me omits refreshTokenId", async () => {
    /* update() has no `select`, so prisma hands back the whole row - the
       endpoint is the only thing standing between it and the response. */
    const userService = {
      update: jest.fn().mockResolvedValue({
        id: "user-1",
        firstName: "Ada",
        email: "ada@example.com",
        refreshTokenId: "session-handle-abc",
      }),
    };
    const controller = new UsersController(
      {} as any,
      {} as any,
      userService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const body: any = await controller.updateUser(req(), {} as any);

    expect(body).not.toHaveProperty("refreshTokenId");
    expect(body.email).toBe("ada@example.com");
  });

  it("GET /auth/user omits refreshTokenId", async () => {
    const controller = new AuthController({} as any, {} as any, {} as any);

    const body: any = await controller.user(req());

    expect(body.user).not.toHaveProperty("refreshTokenId");
    expect(body.user.email).toBe("ada@example.com");
  });
});
