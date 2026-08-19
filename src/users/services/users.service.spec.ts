import { UsersService } from "./users.service";
import { MAX_PAGE_SIZE } from "../../util/pagination";

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

    const users = await service.findAll({ name: "Ada Lovelace", take: 1 });

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
    // The cap is derived from MAX_PAGE_SIZE, so it tracks the page limit.
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: undefined,
        take: MAX_PAGE_SIZE * 5,
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
            // The user owns nothing, so reassignOwnedOrganizations is a no-op —
            // but it runs first and needs the client to answer.
            userOrganizationRole: {
              findMany: jest.fn().mockResolvedValue([]),
              update: jest.fn(),
            },
            organization: { delete: jest.fn() },
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

  describe("getLinkedProviders", () => {
    it("lists the user's providers with when they were linked", async () => {
      const rows = [
        { provider: "VIPPS", createdAt: new Date("2024-01-01") },
        { provider: "GOOGLE", createdAt: new Date("2026-08-19") },
      ];
      const prisma = {
        providerUser: { findMany: jest.fn().mockResolvedValue(rows) },
      } as any;

      const service = new UsersService(prisma, {} as any, {} as any);

      await expect(service.getLinkedProviders("user-1")).resolves.toEqual(rows);
      expect(prisma.providerUser.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "user-1" } }),
      );
    });
  });

  describe("linkProvider", () => {
    const vippsProfile = {
      email: "ola@example.com",
      phone: "+4712345678",
      firstName: "Ola",
      lastName: "Nordmann",
      birthDate: new Date("1995-06-01").toISOString(),
    };

    const buildPrisma = (user: Record<string, unknown>, phoneOwner?: any) => {
      const trx = {
        providerUser: { create: jest.fn().mockResolvedValue({}) },
        user: {
          findUnique: jest.fn(async ({ where }: any) =>
            where.id ? user : (phoneOwner ?? null),
          ),
          update: jest.fn().mockResolvedValue({}),
        },
      };
      return {
        trx,
        prisma: {
          $transaction: jest.fn(async (cb: any) => cb(trx)),
        } as any,
      };
    };

    it("creates the provider row for the user", async () => {
      const { prisma, trx } = buildPrisma({ id: "user-1", phone: null });
      const service = new UsersService(prisma, {} as any, {} as any);

      await service.linkProvider("user-1", "GOOGLE" as any, "sub-g");

      expect(trx.providerUser.create).toHaveBeenCalledWith({
        data: { provider: "GOOGLE", sub: "sub-g", id: "user-1" },
      });
      expect(trx.user.update).not.toHaveBeenCalled();
    });

    it("backfills phone and birthDate when linking Vipps onto a bare account", async () => {
      const { prisma, trx } = buildPrisma({
        id: "user-1",
        phone: null,
        birthDate: null,
      });
      const service = new UsersService(prisma, {} as any, {} as any);

      await service.linkProvider(
        "user-1",
        "VIPPS" as any,
        "sub-v",
        vippsProfile,
      );

      expect(trx.providerUser.create).toHaveBeenCalledWith({
        data: { provider: "VIPPS", sub: "sub-v", id: "user-1" },
      });
      expect(trx.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: {
          phone: vippsProfile.phone,
          birthDate: vippsProfile.birthDate,
        },
      });
    });

    it("skips the phone backfill when the number belongs to someone else", async () => {
      const { prisma, trx } = buildPrisma(
        { id: "user-1", phone: null, birthDate: null },
        { id: "someone-else" },
      );
      const service = new UsersService(prisma, {} as any, {} as any);

      await service.linkProvider(
        "user-1",
        "VIPPS" as any,
        "sub-v",
        vippsProfile,
      );

      expect(trx.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { birthDate: vippsProfile.birthDate },
      });
    });

    it("never overwrites profile fields the user already has", async () => {
      const { prisma, trx } = buildPrisma({
        id: "user-1",
        phone: "+4799999999",
        birthDate: new Date("1990-01-01"),
      });
      const service = new UsersService(prisma, {} as any, {} as any);

      await service.linkProvider(
        "user-1",
        "VIPPS" as any,
        "sub-v",
        vippsProfile,
      );

      expect(trx.user.update).not.toHaveBeenCalled();
    });
  });

  describe("unlinkProvider", () => {
    const buildPrisma = (count: number, deleted: number) => {
      const trx = {
        providerUser: {
          count: jest.fn().mockResolvedValue(count),
          deleteMany: jest.fn().mockResolvedValue({ count: deleted }),
        },
      };
      return {
        trx,
        prisma: {
          $transaction: jest.fn(async (cb: any) => cb(trx)),
        } as any,
      };
    };

    it("deletes the provider row when another login method remains", async () => {
      const { prisma, trx } = buildPrisma(2, 1);
      const service = new UsersService(prisma, {} as any, {} as any);

      await service.unlinkProvider("user-1", "GOOGLE" as any);

      expect(trx.providerUser.deleteMany).toHaveBeenCalledWith({
        where: { id: "user-1", provider: "GOOGLE" },
      });
    });

    /* Removing the only provider row locks the account out for good: there is
       no password fallback, and dev-login is loopback-gated. */
    it("refuses to remove the last login method", async () => {
      const { prisma, trx } = buildPrisma(1, 1);
      const service = new UsersService(prisma, {} as any, {} as any);

      await expect(
        service.unlinkProvider("user-1", "VIPPS" as any),
      ).rejects.toThrow("last login method");
      expect(trx.providerUser.deleteMany).not.toHaveBeenCalled();
    });

    it("404s when the provider was not linked", async () => {
      const { prisma } = buildPrisma(2, 0);
      const service = new UsersService(prisma, {} as any, {} as any);

      await expect(
        service.unlinkProvider("user-1", "GOOGLE" as any),
      ).rejects.toThrow("not linked");
    });
  });
});
