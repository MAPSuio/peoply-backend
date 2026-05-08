import { UsersService } from "./users.service";

describe("UsersService", () => {
  it("sorts name searches by relevance before paginating", async () => {
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "3",
            firstName: "Grace",
            lastName: "Hopper",
            image: null,
            description: null,
          },
          {
            id: "1",
            firstName: "Adrian",
            lastName: "Lovell",
            image: null,
            description: null,
          },
          {
            id: "2",
            firstName: "Ada",
            lastName: "Lovelace",
            image: null,
            description: null,
          },
        ]),
      },
    } as any;

    const service = new UsersService(prisma, {} as any, {} as any);

    const users = await service.findAll({ name: "Ada Lovelace" }, 0, 1);

    expect(users).toEqual([
      {
        id: "2",
        firstName: "Ada",
        lastName: "Lovelace",
        image: null,
        description: null,
      },
    ]);
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: undefined,
        take: undefined,
      }),
    );
  });

  it("matches search tokens across first and last name", async () => {
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "1",
            firstName: "Ida",
            lastName: "Hansen",
            image: null,
            description: null,
          },
        ]),
      },
    } as any;

    const service = new UsersService(prisma, {} as any, {} as any);

    const users = await service.findAll({ name: "ida han" });

    expect(users).toEqual([
      {
        id: "1",
        firstName: "Ida",
        lastName: "Hansen",
        image: null,
        description: null,
      },
    ]);
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            {
              OR: [
                {
                  firstName: { contains: "ida", mode: "insensitive" },
                },
                {
                  lastName: { contains: "ida", mode: "insensitive" },
                },
              ],
            },
            {
              OR: [
                {
                  firstName: { contains: "han", mode: "insensitive" },
                },
                {
                  lastName: { contains: "han", mode: "insensitive" },
                },
              ],
            },
          ],
        },
      }),
    );
  });

  it("adds norwegian character variants for ascii searches", async () => {
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "1",
            firstName: "Øystein",
            lastName: "Nilsen",
            image: null,
            description: null,
          },
        ]),
      },
    } as any;

    const service = new UsersService(prisma, {} as any, {} as any);

    const users = await service.findAll({ name: "oystein" });

    expect(users[0]?.firstName).toBe("Øystein");
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            {
              OR: expect.arrayContaining([
                {
                  firstName: {
                    contains: "oystein",
                    mode: "insensitive",
                  },
                },
                {
                  firstName: {
                    contains: "øystein",
                    mode: "insensitive",
                  },
                },
              ]),
            },
          ],
        },
      }),
    );
  });

  it("keeps aa transliteration matches after post-filtering", async () => {
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "1",
            firstName: "Pål",
            lastName: "Hansen",
            image: null,
            description: null,
          },
        ]),
      },
    } as any;

    const service = new UsersService(prisma, {} as any, {} as any);

    const users = await service.findAll({ name: "Paal" });

    expect(users[0]?.firstName).toBe("Pål");
  });

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
