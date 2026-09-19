import { EventArrangerRole, RegStatus } from "../generated/prisma/client";
import { EventsService } from "./events.service";

const EVENT_ID = "event-1";
const ARRANGER_ID = "arranger-1";

describe("EventsService.update capacity floor", () => {
  let prisma: any;
  let service: EventsService;

  const setup = (goingCount: number) => {
    prisma = {
      event: {
        findUnique: jest.fn().mockResolvedValue({
          id: EVENT_ID,
          readOnly: false,
          eventArrangers: [
            {
              eventId: EVENT_ID,
              arrangerId: ARRANGER_ID,
              role: EventArrangerRole.ADMIN,
            },
          ],
        }),
        update: jest.fn().mockResolvedValue({ id: EVENT_ID }),
      },
      registration: { count: jest.fn().mockResolvedValue(goingCount) },
      $transaction: jest.fn((callback: any) => callback(prisma)),
      eventCategory: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };

    service = new EventsService(
      prisma,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  };

  const updateCapacityTo = (capacity?: number) =>
    service.update({ capacity } as any, EVENT_ID, "user-1");

  it("refuses a capacity below the attendees already holding a seat", async () => {
    setup(12);

    await expect(updateCapacityTo(10)).rejects.toThrow(
      "Capacity can not be lower than the 12 registered attendees",
    );
    expect(prisma.event.update).not.toHaveBeenCalled();
  });

  it("counts only the attendees, not the waitlist behind them", async () => {
    setup(1);

    await updateCapacityTo(1);

    expect(prisma.registration.count).toHaveBeenCalledWith({
      where: { eventId: EVENT_ID, regStatus: RegStatus.GOING },
    });
  });

  it("allows a capacity that exactly fits the attendees", async () => {
    setup(10);

    await expect(updateCapacityTo(10)).resolves.toBeDefined();
  });

  it.each([undefined, 0])(
    "counts nobody when the caller passes %p as capacity",
    async (capacity) => {
      setup(12);

      await updateCapacityTo(capacity);

      expect(prisma.registration.count).not.toHaveBeenCalled();
    },
  );
});
