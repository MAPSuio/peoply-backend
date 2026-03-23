import {
  EventUpdateVisibility,
  EventVisibility,
  RegStatus,
} from ".prisma/client";
import { EventNotFoundException } from "./exceptions";
import { EventsService } from "./events.service";

describe("EventsService", () => {
  const prisma = {
    event: {
      findUnique: jest.fn(),
    },
    registration: {
      findUnique: jest.fn(),
    },
    eventUpdate: {
      findMany: jest.fn(),
    },
  } as any;

  const arrangersService = {} as any;
  const azureStorageService = {} as any;
  const azureCommunicationService = {} as any;
  let service: EventsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new EventsService(
      prisma,
      arrangersService,
      azureStorageService,
      azureCommunicationService,
    );
  });

  it("rejects unauthenticated access to an unlisted event", async () => {
    prisma.event.findUnique.mockResolvedValueOnce({
      id: "event-1",
      visibility: EventVisibility.UNLISTED,
    });

    await expect(
      service.findOneVisibleToUser("event-1"),
    ).rejects.toBeInstanceOf(EventNotFoundException);
  });

  it("allows invited users to view an unlisted event", async () => {
    prisma.event.findUnique.mockResolvedValueOnce({
      id: "event-1",
      visibility: EventVisibility.UNLISTED,
    });
    prisma.registration.findUnique.mockResolvedValueOnce({
      regStatus: RegStatus.INVITED,
    });

    await expect(
      service.findOneVisibleToUser("event-1", "user-1", false),
    ).resolves.toEqual({
      id: "event-1",
      visibility: EventVisibility.UNLISTED,
    });
  });

  it("sanitizes public event updates", async () => {
    prisma.eventUpdate.findMany.mockResolvedValueOnce([
      {
        id: "update-1",
        visibility: EventUpdateVisibility.ALL,
        subject: "Hello",
        body: "World",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);

    await expect(service.getUpdatesForEvent("event-1")).resolves.toEqual([
      {
        id: "update-1",
        visibility: EventUpdateVisibility.ALL,
        subject: "Hello",
        body: "World",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);

    expect(prisma.eventUpdate.findMany).toHaveBeenCalledWith({
      where: { eventId: "event-1", visibility: EventUpdateVisibility.ALL },
      select: {
        id: true,
        visibility: true,
        subject: true,
        body: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  });
});
