import { UsersService } from "./users.service";

describe("UsersService", () => {
  it("rotates the refresh token id", async () => {
    const prisma = {
      user: {
        update: jest.fn().mockImplementation(({ where, data }) => ({
          id: where.id,
          refreshTokenId: data.refreshTokenId,
        })),
      },
    } as any;

    const service = new UsersService(prisma, {} as any, {} as any);

    const updatedUser = (await service.rotateRefreshTokenId("user-1")) as any;

    expect(updatedUser.id).toBe("user-1");
    expect(updatedUser.refreshTokenId).toEqual(expect.any(String));
    expect(updatedUser.refreshTokenId).not.toHaveLength(0);
  });
});
