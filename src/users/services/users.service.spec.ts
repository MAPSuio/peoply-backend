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
    // Ranking still happens after the query, so `skip` stays unset — but the
    // candidate set is capped so a broad query cannot read the whole table.
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: undefined,
        take: 500,
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

  describe("ensureRefreshTokenId", () => {
    it("returns the user untouched when they already have a refreshTokenId", async () => {
      const updateMany = jest.fn().mockResolvedValue({ count: 0 });
      const prisma = {
        user: {
          updateMany,
          findUnique: jest
            .fn()
            .mockResolvedValue({ id: "user-1", refreshTokenId: "existing" }),
        },
      } as any;

      const service = new UsersService(prisma, {} as any, {} as any);

      const user = (await service.ensureRefreshTokenId("user-1")) as any;

      expect(user.refreshTokenId).toBe("existing");
      // Conditional update runs but matches 0 rows (count: 0) — that's fine.
      expect(updateMany).toHaveBeenCalledWith({
        where: { id: "user-1", refreshTokenId: null },
        data: { refreshTokenId: expect.any(String) },
      });
    });

    it("generates a refreshTokenId when the user has none yet", async () => {
      let storedRefreshTokenId: string | null = null;
      const prisma = {
        user: {
          updateMany: jest.fn().mockImplementation(({ where, data }) => {
            if (where.refreshTokenId === null) {
              storedRefreshTokenId = data.refreshTokenId;
              return { count: 1 };
            }
            return { count: 0 };
          }),
          findUnique: jest.fn().mockImplementation(({ where }) => ({
            id: where.id,
            refreshTokenId: storedRefreshTokenId,
          })),
        },
      } as any;

      const service = new UsersService(prisma, {} as any, {} as any);

      const user = (await service.ensureRefreshTokenId("user-1")) as any;

      expect(prisma.user.updateMany).toHaveBeenCalledTimes(1);
      expect(user.id).toBe("user-1");
      expect(user.refreshTokenId).toEqual(expect.any(String));
      expect(user.refreshTokenId.length).toBeGreaterThan(0);
    });

    it("throws when the user does not exist", async () => {
      const prisma = {
        user: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          findUnique: jest.fn().mockResolvedValue(null),
        },
      } as any;

      const service = new UsersService(prisma, {} as any, {} as any);

      await expect(
        service.ensureRefreshTokenId("missing"),
      ).rejects.toMatchObject({ message: expect.stringMatching(/missing/) });
    });
  });

  describe("remove", () => {
    const buildPrisma = (order: string[]) => {
      const arrangerDelete = jest.fn().mockImplementation(async () => {
        order.push("arranger.delete");
        return {};
      });

      return {
        user: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ id: "user-1", arrangerId: "arranger-1" }),
        },
        // interactive transaction: hand the callback a client that records order
        $transaction: jest.fn(async (cb: any) =>
          cb({
            event: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
            arranger: { delete: arrangerDelete },
          }),
        ),
      } as any;
    };

    it("finishes releasing registrations before deleting the user", async () => {
      const order: string[] = [];
      const prisma = buildPrisma(order);

      const userRegistrationService = {
        updateAllRegistrationsOfUserToNotGoing: jest.fn(
          () =>
            new Promise<void>((resolve) =>
              setImmediate(() => {
                order.push("registrations.released");
                resolve();
              }),
            ),
        ),
      } as any;

      const service = new UsersService(
        prisma,
        {} as any,
        userRegistrationService,
      );

      await service.remove("user-1");

      expect(
        userRegistrationService.updateAllRegistrationsOfUserToNotGoing,
      ).toHaveBeenCalledWith("user-1");
      // The old code did not await this, so the arranger (and the user, by
      // cascade) could be deleted while registrations were still being freed.
      expect(order).toEqual(["registrations.released", "arranger.delete"]);
    });

    it("does not delete the user when releasing registrations fails", async () => {
      const order: string[] = [];
      const prisma = buildPrisma(order);

      const userRegistrationService = {
        updateAllRegistrationsOfUserToNotGoing: jest
          .fn()
          .mockRejectedValue(new Error("database unavailable")),
      } as any;

      const service = new UsersService(
        prisma,
        {} as any,
        userRegistrationService,
      );

      await expect(service.remove("user-1")).rejects.toThrow(
        "database unavailable",
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(order).toEqual([]);
    });
  });
});
