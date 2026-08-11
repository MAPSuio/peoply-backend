import { EventVisibility, RegStatus } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  registrationGrantsEventAccess,
  viewableEventIds,
} from "./registration-visibility";

describe("registrationGrantsEventAccess", () => {
  it.each([RegStatus.INVITED, RegStatus.GOING, RegStatus.WAITLISTED])(
    "grants a private event to %s",
    (regStatus) => {
      expect(
        registrationGrantsEventAccess(EventVisibility.PRIVATE, regStatus),
      ).toBe(true);
    },
  );

  /* The two statuses the fix is about: both mean access has ended, and both
     used to keep returning the event row anyway. */
  it.each([RegStatus.NOT_GOING, RegStatus.BANNED])(
    "refuses a private event to %s",
    (regStatus) => {
      expect(
        registrationGrantsEventAccess(EventVisibility.PRIVATE, regStatus),
      ).toBe(false);
    },
  );

  /* canViewEvent gates UNLISTED exactly as it gates PRIVATE - the difference
     between the two lives in the registration gate, not in the read gate. */
  it("refuses an unlisted event to a banned user", () => {
    expect(
      registrationGrantsEventAccess(EventVisibility.UNLISTED, RegStatus.BANNED),
    ).toBe(false);
  });

  it.each([RegStatus.NOT_GOING, RegStatus.BANNED])(
    "still allows a public event to %s",
    (regStatus) => {
      expect(
        registrationGrantsEventAccess(EventVisibility.PUBLIC, regStatus),
      ).toBe(true);
    },
  );
});

describe("viewableEventIds", () => {
  const prismaFor = (arranged: string[], registered: string[]) =>
    ({
      eventArranger: {
        findMany: jest
          .fn()
          .mockResolvedValue(arranged.map((eventId) => ({ eventId }))),
      },
      registration: {
        findMany: jest
          .fn()
          .mockResolvedValue(registered.map((eventId) => ({ eventId }))),
      },
    }) as unknown as PrismaService;

  it("returns nothing and issues no query for an empty list", async () => {
    const prisma = prismaFor([], []);

    expect(await viewableEventIds(prisma, "u1", [])).toEqual(new Set());
    expect(prisma.eventArranger.findMany).not.toHaveBeenCalled();
    expect(prisma.registration.findMany).not.toHaveBeenCalled();
  });

  it("counts arranging an event as its own grant", async () => {
    const viewable = await viewableEventIds(prismaFor(["e1"], []), "u1", [
      "e1",
      "e2",
    ]);

    expect(viewable).toEqual(new Set(["e1"]));
  });

  it("only asks the database about the ids it was given", async () => {
    const prisma = prismaFor([], []);
    await viewableEventIds(prisma, "u1", ["e1", "e2"]);

    expect(prisma.registration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          eventId: { in: ["e1", "e2"] },
          userId: "u1",
          regStatus: {
            in: [RegStatus.INVITED, RegStatus.GOING, RegStatus.WAITLISTED],
          },
        }),
      }),
    );
  });

  it("merges both grants without duplicating", async () => {
    const viewable = await viewableEventIds(
      prismaFor(["e1"], ["e1", "e2"]),
      "u1",
      ["e1", "e2", "e3"],
    );

    expect(viewable).toEqual(new Set(["e1", "e2"]));
  });
});
