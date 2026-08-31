import { createBudgetStore } from "./abuse-budget.module";
import { InMemoryBudgetStore } from "./in-memory-budget-store";

describe("createBudgetStore", () => {
  it("refuses to boot production without a shared store", () => {
    expect(() => createBudgetStore(undefined, true)).toThrow(/REDIS_URL/);
  });

  it("falls back to an in-memory store outside production", () => {
    expect(createBudgetStore(undefined, false)).toBeInstanceOf(
      InMemoryBudgetStore,
    );
  });
});
