import { Prisma } from "../generated/prisma/client";
import { BUDGET_ACTIONS } from "./budget-action";
import {
  COSTED_CREATE_ACTIONS,
  costedCreateAction,
  rowsCreatedBy,
} from "./budgeted-prisma.extension";

const prismaModelNames = new Set(
  Object.values(Prisma.ModelName as Record<string, string>).map(
    (name) => name.charAt(0).toLowerCase() + name.slice(1),
  ),
);

describe("costed create mapping", () => {
  it("names only models that still exist in the schema", () => {
    for (const model of Object.keys(COSTED_CREATE_ACTIONS)) {
      expect(prismaModelNames).toContain(model);
    }
  });

  it("maps only to actions that exist in the budget catalogue", () => {
    for (const action of Object.values(COSTED_CREATE_ACTIONS)) {
      expect(Object.keys(BUDGET_ACTIONS)).toContain(action);
    }
  });

  it("charges every way Prisma can insert rows", () => {
    for (const operation of [
      "create",
      "createMany",
      "createManyAndReturn",
      "upsert",
    ]) {
      expect(costedCreateAction("Organization", operation)).toBe(
        "organization.create",
      );
    }
  });

  it("leaves reads, updates and uncosted models uncharged", () => {
    expect(costedCreateAction("Organization", "findMany")).toBeNull();
    expect(costedCreateAction("Organization", "update")).toBeNull();
    expect(costedCreateAction("Category", "create")).toBeNull();
    expect(costedCreateAction(undefined, "create")).toBeNull();
  });

  it("counts a batch insert by its row count", () => {
    expect(rowsCreatedBy({ data: [{}, {}, {}] })).toBe(3);
    expect(rowsCreatedBy({ data: {} })).toBe(1);
    expect(rowsCreatedBy(undefined)).toBe(1);
  });
});
