import {
  EventArrangerRole,
  EventUpdateVisibility,
  EventVisibility,
  InvitationStatus,
  OrganizationRole,
  RegStatus,
} from "../generated/prisma/client";
import {
  EventNotFoundException,
  EventUpdateNotFoundException,
} from "./exceptions";
import { EventCoOrganizerInvitationsService } from "../invitations/services/eventCoOrganizerInvitations.service";
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
      create: jest.fn(),
      createMany: jest.fn(),
      deleteMany: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    eventCoOrganizerInvitation: {
      findMany: jest.fn(),
      upsert: jest.fn(),
      updateMany: jest.fn(),
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
      updateMany: jest.fn(),
    },
  } as any;

  const arrangersService = {} as any;
  const azureStorageService = {} as any;
  const azureCommunicationService = {} as any;
  let service: EventsService;
  // A real instance rather than a mock: the point of these tests is that the
  // co-organizer path invites instead of attaching, which is that service's
  // behaviour.
  let coOrganizerInvitationsService: EventCoOrganizerInvitationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(
      (callback: (client: typeof prisma) => unknown) => callback(prisma),
    );
    prisma.eventCoOrganizerInvitation.findMany.mockResolvedValue([]);
    coOrganizerInvitationsService = new EventCoOrganizerInvitationsService(
      prisma,
    );
    service = new EventsService(
      prisma,
      arrangersService,
      azureStorageService,
      azureCommunicationService,
      coOrganizerInvitationsService,
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
    prisma.event.findUnique.mockResolvedValueOnce({
      id: "event-1",
      visibility: EventVisibility.PUBLIC,
    });
    prisma.eventArranger.findFirst.mockResolvedValueOnce(null);
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

  // The route is interceptor-only because updates on a public event are
  // public. That made this the one place an event's visibility is enforced,
  // and it was not being enforced: any caller could read the announcements of
  // an event GET /events/:id would 404 for them.
  it("refuses updates for an unlisted event the caller cannot view", async () => {
    prisma.event.findUnique.mockResolvedValueOnce({
      id: "event-1",
      visibility: EventVisibility.UNLISTED,
    });
    prisma.eventArranger.findFirst.mockResolvedValueOnce(null);

    await expect(service.getUpdatesForEvent("event-1")).rejects.toBeInstanceOf(
      EventNotFoundException,
    );

    expect(prisma.eventUpdate.findMany).not.toHaveBeenCalled();
  });

  it("refuses updates for an event that does not exist", async () => {
    prisma.event.findUnique.mockResolvedValueOnce(null);

    await expect(service.getUpdatesForEvent("nope")).rejects.toBeInstanceOf(
      EventNotFoundException,
    );

    expect(prisma.eventUpdate.findMany).not.toHaveBeenCalled();
  });

  it("serves updates for an unlisted event to an invited user", async () => {
    prisma.event.findUnique.mockResolvedValueOnce({
      id: "event-1",
      visibility: EventVisibility.UNLISTED,
    });
    prisma.eventArranger.findFirst.mockResolvedValueOnce(null);
    // canViewEvent, then the GOING check inside getUpdatesForEvent
    prisma.registration.findUnique
      .mockResolvedValueOnce({ regStatus: RegStatus.INVITED })
      .mockResolvedValueOnce({ regStatus: RegStatus.INVITED });
    prisma.eventUpdate.findMany.mockResolvedValueOnce([]);

    await expect(
      service.getUpdatesForEvent("event-1", "user-1", false),
    ).resolves.toEqual([]);
  });

  // EventRolesGuard authorises the caller against the event in the URL, so the
  // delete has to be constrained to it. Filtering on the update id alone let an
  // arranger of any event delete an announcement belonging to any other event.
  it("scopes an update delete to the event that was authorised", async () => {
    prisma.eventUpdate.updateMany.mockResolvedValueOnce({ count: 1 });

    await service.deleteUpdateForEvent("event-1", "update-1");

    expect(prisma.eventUpdate.updateMany).toHaveBeenCalledWith({
      where: { id: "update-1", eventId: "event-1" },
      data: { visibility: EventUpdateVisibility.DELETED },
    });
  });

  it("refuses to delete an update belonging to another event", async () => {
    prisma.eventUpdate.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      service.deleteUpdateForEvent("event-i-arrange", "someone-elses-update"),
    ).rejects.toBeInstanceOf(EventUpdateNotFoundException);
  });

  it("invites co-organizer organizations instead of attaching them", async () => {
    // The whole point of the invitation flow: naming an organization on your
    // own event must not put that organization's name and logo on it. Before
    // this, POST /events with coOrganizerOrganizationIds created a
    // COLLABORATOR EventArranger row for any organization id you liked.
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
      "user-1",
    );

    expect(prisma.eventArranger.create).toHaveBeenCalledWith({
      data: {
        eventId: expect.any(String),
        arrangerId: "arranger-1",
        role: EventArrangerRole.ADMIN,
      },
    });

    const attachedRoles = prisma.eventArranger.create.mock.calls
      .map(([arg]: [any]) => arg.data.role)
      .concat(
        prisma.eventArranger.createMany.mock.calls.flatMap(([arg]: [any]) =>
          arg.data.map((row: any) => row.role),
        ),
      );
    expect(attachedRoles).not.toContain(EventArrangerRole.COLLABORATOR);

    for (const organizationId of ["org-1", "org-2"]) {
      expect(prisma.eventCoOrganizerInvitation.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            organizationId,
            fromUserId: "user-1",
            invitationStatus: InvitationStatus.PENDING,
          }),
        }),
      );
    }
  });

  it("does not invite the event's own organization as a co-organizer", async () => {
    arrangersService.findOne = jest
      .fn()
      .mockResolvedValue({ id: "org-arranger-1" });
    prisma.organization.findMany.mockResolvedValueOnce([
      { id: "org-1", arrangerId: "org-arranger-1" },
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
        coOrganizerOrganizationIds: ["org-1"],
      } as any,
      "org-arranger-1",
      "user-1",
    );

    expect(prisma.eventCoOrganizerInvitation.upsert).not.toHaveBeenCalled();
  });

  it("rejects an unknown co-organizer organization id", async () => {
    arrangersService.findOne = jest
      .fn()
      .mockResolvedValue({ id: "arranger-1" });
    prisma.organization.findMany.mockResolvedValueOnce([]);
    prisma.event.create.mockResolvedValueOnce({ id: "event-1" });

    await expect(
      service.create(
        {
          title: "Test event",
          description: "Description",
          startDate: new Date("2026-05-01T10:00:00.000Z"),
          visibility: EventVisibility.PUBLIC,
          hasFood: false,
          categoryIds: [1],
          coOrganizerOrganizationIds: ["does-not-exist"],
        } as any,
        "arranger-1",
        "user-1",
      ),
    ).rejects.toThrow();
  });

  it("withdraws a co-organizer that the event admin removed", async () => {
    // resolveOrganizations sees the requested ids...
    prisma.organization.findMany.mockResolvedValueOnce([
      { id: "org-2", arrangerId: "org-arranger-2" },
    ]);
    // ...and detachArrangers then looks up the withdrawn one.
    prisma.organization.findMany.mockResolvedValueOnce([
      { arrangerId: "org-arranger-1" },
    ]);
    prisma.eventCoOrganizerInvitation.findMany.mockResolvedValueOnce([
      {
        id: "invitation-1",
        organizationId: "org-1",
        invitationStatus: InvitationStatus.ACCEPTED,
      },
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
      "user-1",
    );

    expect(prisma.eventCoOrganizerInvitation.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["invitation-1"] } },
      data: {
        invitationStatus: InvitationStatus.CANCELLED,
        respondedByUserId: "user-1",
      },
    });

    // Scoped to the withdrawn organization's arranger, not a blanket delete of
    // every collaborator on the event.
    expect(prisma.eventArranger.deleteMany).toHaveBeenCalledWith({
      where: {
        eventId: "event-1",
        role: EventArrangerRole.COLLABORATOR,
        arrangerId: { in: ["org-arranger-1"] },
      },
    });

    // The newly named organization is invited, not attached.
    expect(prisma.eventCoOrganizerInvitation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          organizationId: "org-2",
          invitationStatus: InvitationStatus.PENDING,
        }),
      }),
    );
    expect(prisma.eventArranger.createMany).not.toHaveBeenCalled();
  });

  it("leaves an already accepted co-organizer alone on a later edit", async () => {
    // Re-submitting the same list must not bounce an accepted organization
    // back to PENDING, which would drop it off the event.
    prisma.organization.findMany.mockResolvedValueOnce([
      { id: "org-1", arrangerId: "org-arranger-1" },
    ]);
    prisma.eventCoOrganizerInvitation.findMany.mockResolvedValueOnce([
      {
        id: "invitation-1",
        organizationId: "org-1",
        invitationStatus: InvitationStatus.ACCEPTED,
      },
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
      ],
    });
    prisma.event.update.mockResolvedValueOnce({ id: "event-1" });

    await service.update(
      {
        title: "Updated title",
        description: "Updated description",
        startDate: new Date("2026-05-01T10:00:00.000Z"),
        visibility: EventVisibility.PUBLIC,
        coOrganizerOrganizationIds: ["org-1"],
      } as any,
      "event-1",
      "user-1",
    );

    expect(prisma.eventCoOrganizerInvitation.upsert).not.toHaveBeenCalled();
    expect(prisma.eventCoOrganizerInvitation.updateMany).not.toHaveBeenCalled();
    expect(prisma.eventArranger.deleteMany).not.toHaveBeenCalled();
  });

  describe("isEventAdmin", () => {
    // The gate for cancelling a co-organizer invitation. Deliberately narrower
    // than EventRolesGuard, which accepts any arranger row whatever its role.
    beforeEach(() => {
      prisma.user = { findUnique: jest.fn() };
      prisma.userOrganizationRole = { findFirst: jest.fn() };
    });

    it("accepts the personal arranger who runs the event", async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        arrangerId: "arranger-1",
      });
      prisma.eventArranger.findMany.mockResolvedValueOnce([
        { arrangerId: "arranger-1" },
      ]);

      await expect(service.isEventAdmin("event-1", "user-1")).resolves.toBe(
        true,
      );
    });

    it("accepts an admin of the organization that runs the event", async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        arrangerId: "arranger-9",
      });
      prisma.eventArranger.findMany.mockResolvedValueOnce([
        { arrangerId: "org-arranger-1" },
      ]);
      prisma.userOrganizationRole.findFirst.mockResolvedValueOnce({
        organizationId: "org-1",
      });

      await expect(service.isEventAdmin("event-1", "user-1")).resolves.toBe(
        true,
      );
      expect(prisma.userOrganizationRole.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            role: {
              in: [OrganizationRole.ADMIN, OrganizationRole.OWNER],
            },
          }),
        }),
      );
    });

    it("refuses a collaborator, who is an arranger but not the host", async () => {
      // findMany is scoped to role ADMIN, so a COLLABORATOR row never shows up
      // here — which is the point: a co-organizer must not be able to cancel
      // the invitations the host sent to other organizations.
      prisma.user.findUnique.mockResolvedValueOnce({
        arrangerId: "org-arranger-2",
      });
      prisma.eventArranger.findMany.mockResolvedValueOnce([
        { arrangerId: "org-arranger-1" },
      ]);
      prisma.userOrganizationRole.findFirst.mockResolvedValueOnce(null);

      await expect(service.isEventAdmin("event-1", "user-1")).resolves.toBe(
        false,
      );
      expect(prisma.eventArranger.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            eventId: "event-1",
            role: EventArrangerRole.ADMIN,
          },
        }),
      );
    });

    it("refuses a stranger", async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        arrangerId: "arranger-9",
      });
      prisma.eventArranger.findMany.mockResolvedValueOnce([
        { arrangerId: "arranger-1" },
      ]);
      prisma.userOrganizationRole.findFirst.mockResolvedValueOnce(null);

      await expect(service.isEventAdmin("event-1", "user-1")).resolves.toBe(
        false,
      );
    });

    it("refuses when the event has no admin arranger at all", async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        arrangerId: "arranger-1",
      });
      prisma.eventArranger.findMany.mockResolvedValueOnce([]);

      await expect(service.isEventAdmin("event-1", "user-1")).resolves.toBe(
        false,
      );
      expect(prisma.userOrganizationRole.findFirst).not.toHaveBeenCalled();
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
