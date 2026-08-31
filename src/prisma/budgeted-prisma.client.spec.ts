import { AbuseBudgetService } from "../abuse-budget/abuse-budget.service";
import { BudgetExceeded } from "../abuse-budget/budget-errors";
import { SYSTEM_CLOCK } from "../abuse-budget/budget-store";
import { InMemoryBudgetStore } from "../abuse-budget/in-memory-budget-store";
import { runWithRequest } from "../abuse-budget/principal-context";
import {
  ipPrincipal,
  userPrincipal,
  type RequestIdentities,
} from "../abuse-budget/principal";
import { Prisma, PrismaClient } from "../generated/prisma/client";
import { createPrismaAdapter } from "./prisma.adapter";
import { withAbuseBudget } from "./budgeted-prisma.client";

const ORGANIZATION_CREATE_LIMIT = 3;
const EVENT_CREATE_LIMIT = 20;

function budgetedClient() {
  const budget = new AbuseBudgetService(
    new InMemoryBudgetStore(),
    SYSTEM_CLOCK,
  );
  const base = new PrismaClient({ adapter: createPrismaAdapter() });

  return { budget, base, client: withAbuseBudget(base, budget) };
}

function identitiesOf(userId: string): RequestIdentities {
  return { user: userPrincipal(userId), ip: ipPrincipal("unknown") };
}

function asAuthenticatedUser<T>(userId: string, run: () => Promise<T>) {
  return runWithRequest({ headers: {}, user: { id: userId } }, run);
}

function asMcpKeyOfUser<T>(
  userId: string,
  keyId: string,
  run: () => Promise<T>,
) {
  return runWithRequest(
    { headers: {}, auth: { extra: { keyId, user: { id: userId } } } },
    run,
  );
}

function upsertOfCostedModel() {
  return {
    where: { id: "00000000-0000-4000-8000-000000000001" },
    create: {} as never,
    update: {},
  };
}

describe("budgeted prisma client", () => {
  it("charges a create issued inside an interactive transaction", async () => {
    const { budget, base, client } = budgetedClient();
    const consume = jest.spyOn(budget, "consume");

    await asAuthenticatedUser("u1", async () => {
      for (let i = 0; i < ORGANIZATION_CREATE_LIMIT; i += 1) {
        await budget.consume(identitiesOf("u1"), "organization.create");
      }

      await expect(
        client.$transaction(async (trx) =>
          trx.organization.create({ data: { name: "spam" } }),
        ),
      ).rejects.toBeInstanceOf(BudgetExceeded);
    });

    expect(consume).toHaveBeenLastCalledWith(
      identitiesOf("u1"),
      "organization.create",
      1,
    );

    await base.$disconnect();
  });

  it("charges createMany by the number of rows it would insert", async () => {
    const { budget, base, client } = budgetedClient();
    const consume = jest.spyOn(budget, "consume");

    await asAuthenticatedUser("u2", async () => {
      await expect(
        client.$transaction(async (trx) =>
          trx.eventInvitation.createMany({
            data: Array.from({ length: 501 }, () => ({
              eventId: "e1",
              userId: "u3",
            })),
          }),
        ),
      ).rejects.toBeInstanceOf(BudgetExceeded);
    });

    expect(consume).toHaveBeenCalledWith(
      identitiesOf("u2"),
      "invitation.recipient",
      501,
    );

    await base.$disconnect();
  });

  it("leaves reads and uncosted models uncharged", async () => {
    const { budget, base, client } = budgetedClient();
    const consume = jest.spyOn(budget, "consume");

    await asAuthenticatedUser("u4", async () => {
      await client.category.findMany({ take: 1 });
    });

    expect(consume).not.toHaveBeenCalled();

    await base.$disconnect();
  });

  it("charges registrations created as a nested write under an event update", async () => {
    const { budget, base, client } = budgetedClient();
    const consume = jest.spyOn(budget, "consume");

    await asAuthenticatedUser("u5", async () => {
      await expect(
        client.event.update({
          where: { id: "00000000-0000-4000-8000-000000000002" },
          data: {
            registrations: {
              create: [
                { userId: "u6", regStatus: "GOING" },
                { userId: "u7", regStatus: "GOING" },
              ],
            },
          },
        }),
      ).rejects.toBeDefined();
    });

    expect(consume).toHaveBeenCalledWith(
      identitiesOf("u5"),
      "registration.create",
      2,
    );

    await base.$disconnect();
  });

  it("charges the parent create and its nested children in one call", async () => {
    const { budget, base, client } = budgetedClient();
    const consume = jest.spyOn(budget, "consume");

    await asAuthenticatedUser("u8", async () => {
      await expect(
        client.event.create({
          data: {
            title: "nested",
            eventInvitations: {
              createMany: {
                data: Array.from({ length: 501 }, () => ({
                  toUserId: "u9",
                  fromUserId: "u8",
                })),
              },
            },
          } as never,
        }),
      ).rejects.toBeInstanceOf(BudgetExceeded);
    });

    expect(consume).toHaveBeenCalledWith(identitiesOf("u8"), "event.create", 1);
    expect(consume).toHaveBeenCalledWith(
      identitiesOf("u8"),
      "invitation.recipient",
      501,
    );

    await base.$disconnect();
  });

  it("refuses an upsert of a costed model from request-scoped code", async () => {
    const { base, client } = budgetedClient();

    await asAuthenticatedUser("u10", async () => {
      await expect(client.event.upsert(upsertOfCostedModel())).rejects.toThrow(
        /must not be upserted/,
      );
    });

    await base.$disconnect();
  });

  it("lets an unscoped upsert through, so the ICS cron keeps importing events", async () => {
    const { base, client } = budgetedClient();

    await expect(
      client.event.upsert(upsertOfCostedModel()),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientValidationError);

    await base.$disconnect();
  });

  it("charges the user bucket when a create arrives over an MCP key", async () => {
    const { budget, base, client } = budgetedClient();

    for (let i = 0; i < EVENT_CREATE_LIMIT; i += 1) {
      await budget.consume(identitiesOf("u11"), "event.create");
    }

    await asMcpKeyOfUser("u11", "key-1", async () => {
      await expect(
        client.event.create({ data: { title: "over mcp" } as never }),
      ).rejects.toBeInstanceOf(BudgetExceeded);
    });

    await base.$disconnect();
  });
});
