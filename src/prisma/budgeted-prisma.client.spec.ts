import { AbuseBudgetService } from "../abuse-budget/abuse-budget.service";
import { BudgetExceeded } from "../abuse-budget/budget-errors";
import { SYSTEM_CLOCK } from "../abuse-budget/budget-store";
import { InMemoryBudgetStore } from "../abuse-budget/in-memory-budget-store";
import { runWithRequest } from "../abuse-budget/principal-context";
import { PrismaClient } from "../generated/prisma/client";
import { createPrismaAdapter } from "./prisma.adapter";
import { withAbuseBudget } from "./budgeted-prisma.client";

const ORGANIZATION_CREATE_LIMIT = 3;

function budgetedClient() {
  const budget = new AbuseBudgetService(
    new InMemoryBudgetStore(),
    SYSTEM_CLOCK,
  );
  const base = new PrismaClient({ adapter: createPrismaAdapter() });

  return { budget, base, client: withAbuseBudget(base, budget) };
}

function asAuthenticatedUser<T>(userId: string, run: () => Promise<T>) {
  return runWithRequest({ headers: {}, user: { id: userId } }, run);
}

describe("budgeted prisma client", () => {
  it("charges a create issued inside an interactive transaction", async () => {
    const { budget, base, client } = budgetedClient();
    const consume = jest.spyOn(budget, "consume");

    await asAuthenticatedUser("u1", async () => {
      for (let i = 0; i < ORGANIZATION_CREATE_LIMIT; i += 1) {
        await budget.consume({ kind: "user", id: "u1" }, "organization.create");
      }

      await expect(
        client.$transaction(async (trx) =>
          trx.organization.create({ data: { name: "spam" } }),
        ),
      ).rejects.toBeInstanceOf(BudgetExceeded);
    });

    expect(consume).toHaveBeenLastCalledWith(
      { kind: "user", id: "u1" },
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
      { kind: "user", id: "u2" },
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
});
