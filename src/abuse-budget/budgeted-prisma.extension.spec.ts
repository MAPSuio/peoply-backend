import { Prisma } from "../generated/prisma/client";
import { BUDGET_ACTIONS } from "./budget-action";
import {
  COSTED_CREATE_ACTIONS,
  costedCreateAction,
  creationChargesFor,
  refuseCostedUpsert,
  rowsCreatedBy,
} from "./budgeted-prisma.extension";

const prismaModelNames = new Set(
  Object.values(Prisma.ModelName as Record<string, string>).map(
    (name) => name.charAt(0).toLowerCase() + name.slice(1),
  ),
);

function chargesAsObject(charges: Map<string, number>) {
  return Object.fromEntries(charges);
}

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
    for (const operation of ["create", "createMany", "createManyAndReturn"]) {
      expect(costedCreateAction("Organization", operation)).toBe(
        "organization.create",
      );
    }
  });

  it("no longer charges upsert, because its update branch would pay too", () => {
    expect(costedCreateAction("Organization", "upsert")).toBeNull();
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

describe("refuseCostedUpsert", () => {
  it("refuses an upsert of a costed model", () => {
    expect(() => refuseCostedUpsert("Event", "upsert")).toThrow(
      /must not be upserted/,
    );
  });

  it("allows upserts of models that carry no creation budget", () => {
    expect(() =>
      refuseCostedUpsert("OrganizationIcsFeed", "upsert"),
    ).not.toThrow();
  });

  it("allows every other operation on a costed model", () => {
    expect(() => refuseCostedUpsert("Event", "update")).not.toThrow();
    expect(() => refuseCostedUpsert(undefined, "upsert")).not.toThrow();
  });
});

describe("creationChargesFor", () => {
  it("charges the top-level create of a costed model", () => {
    expect(
      chargesAsObject(
        creationChargesFor("Event", "create", { data: { title: "x" } }),
      ),
    ).toEqual({ "event.create": 1 });
  });

  it("charges a nested create hidden inside an update", () => {
    expect(
      chargesAsObject(
        creationChargesFor("Event", "update", {
          where: { id: "e1" },
          data: { registrations: { create: [{}, {}, {}] } },
        }),
      ),
    ).toEqual({ "registration.create": 3 });
  });

  it("charges a single nested create as one row", () => {
    expect(
      chargesAsObject(
        creationChargesFor("Event", "update", {
          data: { eventInvitations: { create: { userId: "u1" } } },
        }),
      ),
    ).toEqual({ "invitation.recipient": 1 });
  });

  it("charges the parent and its nested children in one call", () => {
    expect(
      chargesAsObject(
        creationChargesFor("Event", "create", {
          data: {
            title: "x",
            registrations: { create: [{}, {}] },
            eventInvitations: { createMany: { data: [{}, {}, {}] } },
          },
        }),
      ),
    ).toEqual({
      "event.create": 1,
      "registration.create": 2,
      "invitation.recipient": 3,
    });
  });

  it("charges connectOrCreate, one row per entry", () => {
    expect(
      chargesAsObject(
        creationChargesFor("Registration", "create", {
          data: {
            event: { connectOrCreate: { where: { id: "e1" }, create: {} } },
          },
        }),
      ),
    ).toEqual({ "registration.create": 1, "event.create": 1 });

    expect(
      chargesAsObject(
        creationChargesFor("User", "update", {
          data: {
            registrations: {
              connectOrCreate: [
                { where: {}, create: {} },
                { where: {}, create: {} },
              ],
            },
          },
        }),
      ),
    ).toEqual({ "registration.create": 2 });
  });

  it("follows relations that nest further than one level", () => {
    expect(
      chargesAsObject(
        creationChargesFor("User", "update", {
          data: {
            registrations: {
              create: [{ event: { create: { title: "x" } } }],
            },
          },
        }),
      ),
    ).toEqual({ "registration.create": 1, "event.create": 1 });
  });

  it("walks the create and update branches of an upsert", () => {
    expect(
      chargesAsObject(
        creationChargesFor("User", "upsert", {
          where: { id: "u1" },
          create: { registrations: { create: [{}, {}] } },
          update: { eventInvitationsToMe: { create: {} } },
        }),
      ),
    ).toEqual({ "registration.create": 2, "invitation.recipient": 1 });
  });

  it("follows a nested update down to the create it hides", () => {
    expect(
      chargesAsObject(
        creationChargesFor("User", "update", {
          data: {
            registrations: {
              update: {
                where: { id: "r1" },
                data: { event: { create: { title: "x" } } },
              },
            },
          },
        }),
      ),
    ).toEqual({ "event.create": 1 });
  });

  it("leaves connects, disconnects and uncosted relations uncharged", () => {
    expect(
      chargesAsObject(
        creationChargesFor("Event", "update", {
          data: {
            registrations: { connect: [{ id: "r1" }], disconnect: [] },
            eventCategories: { create: [{ categoryId: 1 }] },
          },
        }),
      ),
    ).toEqual({});
  });

  it("ignores arguments that carry no write payload", () => {
    expect(
      chargesAsObject(
        creationChargesFor("Event", "findMany", { where: { id: "e1" } }),
      ),
    ).toEqual({});
    expect(
      chargesAsObject(creationChargesFor(undefined, "$queryRaw", [])),
    ).toEqual({});
  });
});
