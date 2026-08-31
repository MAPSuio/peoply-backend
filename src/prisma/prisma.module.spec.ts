import { Test } from "@nestjs/testing";
import { AbuseBudgetModule } from "../abuse-budget/abuse-budget.module";
import { BUDGET_STORE } from "../abuse-budget/budget-tokens";
import { InMemoryBudgetStore } from "../abuse-budget/in-memory-budget-store";
import { BudgetExceeded } from "../abuse-budget/budget-errors";
import { runWithRequest } from "../abuse-budget/principal-context";
import { PrismaModule } from "./prisma.module";
import { PrismaService } from "./prisma.service";

const ORGANIZATION_CREATE_LIMIT = 3;

async function swallowUnlessBudgetExceeded(attempt: Promise<unknown>) {
  try {
    await attempt;
  } catch (error) {
    if (error instanceof BudgetExceeded) throw error;
  }
}

describe("PrismaModule wiring", () => {
  it("hands out a charging client, so no service can be given the raw one", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AbuseBudgetModule, PrismaModule],
    })
      .overrideProvider(BUDGET_STORE)
      .useValue(new InMemoryBudgetStore())
      .compile();

    const prisma = moduleRef.get(PrismaService);

    await runWithRequest(
      { headers: {}, ip: "203.0.113.7", user: { id: "wiring-user" } },
      async () => {
        for (let spent = 0; spent < ORGANIZATION_CREATE_LIMIT; spent += 1) {
          await swallowUnlessBudgetExceeded(
            prisma.organization.create({ data: { name: `probe-${spent}` } }),
          );
        }

        await expect(
          swallowUnlessBudgetExceeded(
            prisma.organization.create({ data: { name: "over-budget" } }),
          ),
        ).rejects.toBeInstanceOf(BudgetExceeded);
      },
    );

    await moduleRef.close();
  });
});
