import { FoodPreference, RegStatus } from "../../generated/prisma/client";
import { ArrangerRegistrationService } from "./arranger.registrations.service";

const EVENT_ID = "event-1";

function buildService(registrations: any[]) {
  const prisma = {
    event: { findUnique: jest.fn().mockResolvedValue({ hasFood: true }) },
    registration: { findMany: jest.fn().mockResolvedValue(registrations) },
  } as any;

  return new ArrangerRegistrationService(prisma, {} as any);
}

describe("ArrangerRegistrationService.findAll on an event that serves food", () => {
  it("does not throw when the caller did not ask for users", async () => {
    /* `user` is only included when includeUsers is set, so it is absent here -
       which is the default shape of GET /events/:id/registrations. The
       redaction pass used to dereference it and answer 500. */
    const service = buildService([
      { eventId: EVENT_ID, userId: "user-1", regStatus: RegStatus.INVITED },
      { eventId: EVENT_ID, userId: "user-2", regStatus: RegStatus.GOING },
    ]);

    const result = await service.findAll({} as any, EVENT_ID);

    expect(result).toHaveLength(2);
  });

  it("still redacts food data for everyone who is not going", async () => {
    const service = buildService([
      {
        eventId: EVENT_ID,
        userId: "user-1",
        regStatus: RegStatus.INVITED,
        user: {
          foodPreference: FoodPreference.VEGAN,
          userAllergens: [{ allergen: { id: 1, name: "Nøtter" } }],
        },
      },
      {
        eventId: EVENT_ID,
        userId: "user-2",
        regStatus: RegStatus.GOING,
        user: {
          foodPreference: FoodPreference.VEGAN,
          userAllergens: [{ allergen: { id: 1, name: "Nøtter" } }],
        },
      },
    ]);

    const [invited, going] = (await service.findAll(
      {} as any,
      EVENT_ID,
    )) as any[];

    expect(invited.user.foodPreference).toBeNull();
    expect(invited.user.userAllergens).toEqual([]);
    expect(going.user.foodPreference).toBe(FoodPreference.VEGAN);
    expect(going.user.userAllergens).toHaveLength(1);
  });
});
