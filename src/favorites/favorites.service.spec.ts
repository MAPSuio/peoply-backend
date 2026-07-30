import { EventVisibility, RegStatus } from "../generated/prisma/client";
import { EventNotFoundException } from "../events/exceptions";
import { FavoritesService } from "./favorites.service";

describe("FavoritesService", () => {
  const prismaService = {
    event: { findUnique: jest.fn() },
    registration: { findUnique: jest.fn() },
    favorite: { create: jest.fn() },
  } as any;

  let service: FavoritesService;

  beforeEach(() => {
    jest.clearAllMocks();
    prismaService.favorite.create.mockResolvedValue({
      eventId: "event-1",
      userId: "user-1",
    });
    service = new FavoritesService(prismaService);
  });

  it.each([EventVisibility.PUBLIC, EventVisibility.UNLISTED])(
    "favourites a %s event without further checks",
    async (visibility) => {
      prismaService.event.findUnique.mockResolvedValueOnce({ visibility });

      await service.create("user-1", "event-1");

      expect(prismaService.favorite.create).toHaveBeenCalled();
      expect(prismaService.registration.findUnique).not.toHaveBeenCalled();
    },
  );

  // findAll returns the whole event row when includeEvent=true, so favouriting
  // a private event was a way to read one you were never invited to.
  it("refuses to favourite a private event the caller cannot view", async () => {
    prismaService.event.findUnique.mockResolvedValueOnce({
      visibility: EventVisibility.PRIVATE,
    });
    prismaService.registration.findUnique.mockResolvedValueOnce(null);

    await expect(service.create("user-1", "event-1")).rejects.toBeInstanceOf(
      EventNotFoundException,
    );

    expect(prismaService.favorite.create).not.toHaveBeenCalled();
  });

  // A ban blocks re-registration through the unique constraint, but nothing
  // stopped a banned user favouriting the event and reading it back.
  it.each([RegStatus.BANNED, RegStatus.NOT_GOING])(
    "refuses a private event for a %s registration",
    async (regStatus) => {
      prismaService.event.findUnique.mockResolvedValueOnce({
        visibility: EventVisibility.PRIVATE,
      });
      prismaService.registration.findUnique.mockResolvedValueOnce({
        regStatus,
      });

      await expect(service.create("user-1", "event-1")).rejects.toBeInstanceOf(
        EventNotFoundException,
      );

      expect(prismaService.favorite.create).not.toHaveBeenCalled();
    },
  );

  it.each([RegStatus.INVITED, RegStatus.GOING, RegStatus.WAITLISTED])(
    "allows a private event for a %s registration",
    async (regStatus) => {
      prismaService.event.findUnique.mockResolvedValueOnce({
        visibility: EventVisibility.PRIVATE,
      });
      prismaService.registration.findUnique.mockResolvedValueOnce({
        regStatus,
      });

      await service.create("user-1", "event-1");

      expect(prismaService.favorite.create).toHaveBeenCalled();
    },
  );

  it("reports a missing event rather than creating a dangling favourite", async () => {
    prismaService.event.findUnique.mockResolvedValueOnce(null);

    await expect(service.create("user-1", "nope")).rejects.toBeInstanceOf(
      EventNotFoundException,
    );

    expect(prismaService.favorite.create).not.toHaveBeenCalled();
  });
});
