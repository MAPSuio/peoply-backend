import {
  EventArrangerRole,
  EventUpdateVisibility,
  EventVisibility,
  RegStatus,
} from ".prisma/client";
import { EventNotFoundException } from "./exceptions";
import { EventsService } from "./events.service";

describe("EventsService", () => {
  const prisma = {
    $transaction: jest.fn(),
    event: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    organization: {
      findMany: jest.fn(),
    },
    eventArranger: {
      createMany: jest.fn(),
      deleteMany: jest.fn(),
      findFirst: jest.fn(),
    },
    eventCategory: {
      createMany: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    registration: {
      count: jest.fn(),
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
    prisma.$transaction.mockImplementation(
      (callback: (client: typeof prisma) => unknown) => callback(prisma),
    );
    service = new EventsService(
      prisma,
      arrangersService,
      azureStorageService,
      azureCommunicationService,
    );
  });

  it("rejects unauthenticated access to an unlisted event", async () => {
    prisma.eventArranger.findFirst.mockResolvedValueOnce(null);
    prisma.event.findUnique.mockResolvedValueOnce({
      id: "event-1",
      visibility: EventVisibility.UNLISTED,
    });

    await expect(
      service.findOneVisibleToUser("event-1"),
    ).rejects.toBeInstanceOf(EventNotFoundException);
  });

  it("allows invited users to view an unlisted event", async () => {
    prisma.eventArranger.findFirst.mockResolvedValueOnce(null);
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

  it("rejects public events from unapproved organizations for regular users", async () => {
    prisma.event.findUnique.mockResolvedValueOnce({
      id: "event-1",
      visibility: EventVisibility.PUBLIC,
    });
    prisma.eventArranger.findFirst.mockResolvedValueOnce({
      eventId: "event-1",
    });

    await expect(
      service.findOneVisibleToUser("event-1", "user-1", false),
    ).rejects.toBeInstanceOf(EventNotFoundException);
  });

  it("allows public events from unapproved organizations for arrangers", async () => {
    prisma.event.findUnique.mockResolvedValueOnce({
      id: "event-1",
      visibility: EventVisibility.PUBLIC,
    });

    await expect(
      service.findOneVisibleToUser("event-1", "user-1", true),
    ).resolves.toEqual({
      id: "event-1",
      visibility: EventVisibility.PUBLIC,
    });

    expect(prisma.eventArranger.findFirst).not.toHaveBeenCalled();
  });

  it("allows public user-arranged events for regular users", async () => {
    prisma.event.findUnique.mockResolvedValueOnce({
      id: "event-1",
      visibility: EventVisibility.PUBLIC,
    });
    prisma.eventArranger.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.findOneVisibleToUser("event-1", "user-1", false),
    ).resolves.toEqual({
      id: "event-1",
      visibility: EventVisibility.PUBLIC,
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

  it("creates collaborator arrangers for valid co-organizer organizations", async () => {
    arrangersService.findOne = jest
      .fn()
      .mockResolvedValue({ id: "arranger-1" });
    prisma.organization.findMany.mockResolvedValueOnce([
      { id: "org-1", arrangerId: "org-arranger-1" },
      { id: "org-2", arrangerId: "org-arranger-2" },
    ]);
    prisma.event.create.mockResolvedValueOnce({
      id: "event-1",
      urlId: "event-url",
    });

    await service.create(
      {
        title: "Test event",
        description: "Description",
        startDate: new Date("2026-05-01T10:00:00.000Z"),
        visibility: EventVisibility.PUBLIC,
        hasFood: false,
        categoryIds: [1],
        coOrganizerOrganizationIds: ["org-1", "org-2"],
      } as any,
      "arranger-1",
    );

    expect(prisma.eventArranger.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        {
          eventId: expect.any(String),
          arrangerId: "arranger-1",
          role: EventArrangerRole.ADMIN,
        },
        {
          eventId: expect.any(String),
          arrangerId: "org-arranger-1",
          role: EventArrangerRole.COLLABORATOR,
        },
        {
          eventId: expect.any(String),
          arrangerId: "org-arranger-2",
          role: EventArrangerRole.COLLABORATOR,
        },
      ]),
    });
  });

  it("updates collaborator arrangers when co-organizers are provided", async () => {
    prisma.organization.findMany.mockResolvedValueOnce([
      { id: "org-2", arrangerId: "org-arranger-2" },
    ]);
    prisma.event.findUnique.mockResolvedValueOnce({
      id: "event-1",
      image: null,
      readOnly: false,
      registrationMode: "PEOPLY",
      externalUrl: null,
      eventArrangers: [
        {
          eventId: "event-1",
          arrangerId: "arranger-1",
          role: EventArrangerRole.ADMIN,
        },
        {
          eventId: "event-1",
          arrangerId: "org-arranger-1",
          role: EventArrangerRole.COLLABORATOR,
        },
      ],
    });
    prisma.event.update.mockResolvedValueOnce({ id: "event-1" });

    await service.update(
      {
        title: "Updated title",
        description: "Updated description",
        startDate: new Date("2026-05-01T10:00:00.000Z"),
        visibility: EventVisibility.PUBLIC,
        coOrganizerOrganizationIds: ["org-2"],
      } as any,
      "event-1",
    );

    expect(prisma.eventArranger.deleteMany).toHaveBeenCalledWith({
      where: {
        eventId: "event-1",
        role: EventArrangerRole.COLLABORATOR,
      },
    });
    expect(prisma.eventArranger.createMany).toHaveBeenCalledWith({
      data: [
        {
          eventId: "event-1",
          arrangerId: "org-arranger-2",
          role: EventArrangerRole.COLLABORATOR,
        },
      ],
    });
  });

  it("uses some-filter for organization scoped event queries", async () => {
    prisma.event.findMany.mockResolvedValueOnce([]);

    await service.findAll({ organizationId: "org-1" } as any);

    expect(prisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          eventArrangers: {
            some: {
              arranger: {
                organization: {
                  id: "org-1",
                },
              },
            },
          },
        }),
      }),
    );
  });
});
