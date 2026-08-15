import { NotFoundException } from "@nestjs/common";
import {
  EventArrangerRole,
  EventVisibility,
  OrganizationRole,
  RegStatus,
} from "../generated/prisma/client";
import { EventNotFoundException } from "../events/exceptions";
import { PrismaService } from "../prisma/prisma.service";
import { EventAccessService } from "./event-access.service";

const { ADMIN, COLLABORATOR } = EventArrangerRole;

describe("EventAccessService", () => {
  const prisma = {
    event: { findUnique: jest.fn() },
    userOrganizationRole: { findMany: jest.fn() },
    registration: { findUnique: jest.fn(), findMany: jest.fn() },
    eventArranger: { findFirst: jest.fn(), findMany: jest.fn() },
  } as unknown as jest.Mocked<PrismaService> & {
    event: { findUnique: jest.Mock };
    userOrganizationRole: { findMany: jest.Mock };
    registration: { findUnique: jest.Mock; findMany: jest.Mock };
    eventArranger: { findFirst: jest.Mock; findMany: jest.Mock };
  };

  let service: EventAccessService;

  /** The caller in every test; their own arranger row is `arranger-user`. */
  const user = { id: "user-1", arrangerId: "arranger-user" };

  const eventWith = (
    eventArrangers: { arrangerId: string; role: EventArrangerRole }[],
  ) => ({ id: "event-1", archivedAt: null, eventArrangers });

  /** The org arrangerIds the user holds a qualifying role in. */
  const memberOf = (...arrangerIds: string[]) =>
    prisma.userOrganizationRole.findMany.mockResolvedValue(
      arrangerIds.map((arrangerId) => ({ organization: { arrangerId } })),
    );

  beforeEach(() => {
    jest.clearAllMocks();
    service = new EventAccessService(prisma);
    prisma.userOrganizationRole.findMany.mockResolvedValue([]);
    prisma.eventArranger.findFirst.mockResolvedValue(null);
  });

  describe("arrangerRoleFor", () => {
    const resolve = (opts?: {
      allowedArrangerRoles?: EventArrangerRole[];
      orgRoles?: OrganizationRole[];
    }) =>
      service.arrangerRoleFor(
        user,
        { id: "event-1" },
        {
          allowedArrangerRoles: opts?.allowedArrangerRoles,
          orgRoles: opts?.orgRoles ?? [OrganizationRole.ADMIN],
        },
      );

    describe("resolving the event from the route params", () => {
      const direct = eventWith([{ arrangerId: "arranger-user", role: ADMIN }]);

      it("looks the event up by id when id is present", async () => {
        prisma.event.findUnique.mockResolvedValueOnce(direct);

        await expect(resolve()).resolves.toBe(ADMIN);
        expect(prisma.event.findUnique).toHaveBeenCalledWith(
          expect.objectContaining({ where: { id: "event-1" } }),
        );
      });

      it("falls back to urlId when id is absent", async () => {
        prisma.event.findUnique.mockResolvedValueOnce(direct);

        await expect(
          service.arrangerRoleFor(
            user,
            { urlId: "my-event" },
            { orgRoles: [OrganizationRole.ADMIN] },
          ),
        ).resolves.toBe(ADMIN);
        expect(prisma.event.findUnique).toHaveBeenCalledWith(
          expect.objectContaining({ where: { urlId: "my-event" } }),
        );
      });

      it("prefers id over urlId when the route supplies both", async () => {
        prisma.event.findUnique.mockResolvedValueOnce(direct);

        // The only case where the two lookups can disagree, and so the only
        // one that pins the precedence rather than just the happy path.
        await expect(
          service.arrangerRoleFor(
            user,
            { id: "event-1", urlId: "my-event" },
            { orgRoles: [OrganizationRole.ADMIN] },
          ),
        ).resolves.toBe(ADMIN);
        expect(prisma.event.findUnique).toHaveBeenCalledWith(
          expect.objectContaining({ where: { id: "event-1" } }),
        );
      });

      it("throws when neither id nor urlId is present", async () => {
        await expect(
          service.arrangerRoleFor(
            user,
            {},
            { orgRoles: [OrganizationRole.ADMIN] },
          ),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(prisma.event.findUnique).not.toHaveBeenCalled();
      });

      it.each([
        ["missing", null],
        ["archived", { ...direct, archivedAt: new Date("2026-01-01") }],
      ])("throws EventNotFoundException for a %s event", async (_, event) => {
        prisma.event.findUnique.mockResolvedValueOnce(event);

        await expect(resolve()).rejects.toBeInstanceOf(EventNotFoundException);
      });
    });

    /* The role matrix that used to live twice, in EventRolesGuard and in
       IsArrangerInterceptor - and diverged. One table, one owner. */
    it.each([
      [
        "a direct ADMIN arranger, unrestricted route",
        eventWith([{ arrangerId: "arranger-user", role: ADMIN }]),
        undefined,
        [],
        ADMIN,
      ],
      [
        "a direct COLLABORATOR, unrestricted route",
        eventWith([{ arrangerId: "arranger-user", role: COLLABORATOR }]),
        undefined,
        [],
        COLLABORATOR,
      ],
      [
        "a direct COLLABORATOR on an ADMIN-only route",
        eventWith([{ arrangerId: "arranger-user", role: COLLABORATOR }]),
        [ADMIN],
        [],
        null,
      ],
      [
        "a direct ADMIN on an ADMIN-only route",
        eventWith([{ arrangerId: "arranger-user", role: ADMIN }]),
        [ADMIN],
        [],
        ADMIN,
      ],
      [
        "an admin of an organization that arranges the event",
        eventWith([{ arrangerId: "arranger-org", role: ADMIN }]),
        undefined,
        ["arranger-org"],
        ADMIN,
      ],
      [
        "an admin of a COLLABORATOR organization on an ADMIN-only route",
        eventWith([{ arrangerId: "arranger-org", role: COLLABORATOR }]),
        [ADMIN],
        ["arranger-org"],
        null,
      ],
      [
        // A person can be both: their own COLLABORATOR row on the event, and
        // an admin of the organization that owns it. The higher grant wins
        // over the first one found.
        "a direct COLLABORATOR who is also admin of the owning org, ADMIN-only route",
        eventWith([
          { arrangerId: "arranger-user", role: COLLABORATOR },
          { arrangerId: "arranger-org", role: ADMIN },
        ]),
        [ADMIN],
        ["arranger-org"],
        ADMIN,
      ],
      [
        "no direct row and no organization membership",
        eventWith([{ arrangerId: "arranger-org", role: ADMIN }]),
        undefined,
        [],
        null,
      ],
      ["an event with no arrangers at all", eventWith([]), undefined, [], null],
    ])(
      "resolves %s to %j",
      async (_, event, allowedArrangerRoles, memberships, expected) => {
        prisma.event.findUnique.mockResolvedValueOnce(event);
        memberOf(...memberships);

        await expect(resolve({ allowedArrangerRoles })).resolves.toBe(expected);
      },
    );

    it("skips the membership query when no arranger has an allowed role", async () => {
      prisma.event.findUnique.mockResolvedValueOnce(
        eventWith([{ arrangerId: "arranger-org", role: COLLABORATOR }]),
      );

      await expect(resolve({ allowedArrangerRoles: [ADMIN] })).resolves.toBe(
        null,
      );
      expect(prisma.userOrganizationRole.findMany).not.toHaveBeenCalled();
    });

    it("asks for the caller's org roles among the qualifying arrangers only", async () => {
      prisma.event.findUnique.mockResolvedValueOnce(
        eventWith([
          { arrangerId: "arranger-org-a", role: ADMIN },
          { arrangerId: "arranger-org-b", role: COLLABORATOR },
        ]),
      );

      await resolve({
        allowedArrangerRoles: [ADMIN],
        orgRoles: [OrganizationRole.ADMIN, OrganizationRole.OWNER],
      });

      expect(prisma.userOrganizationRole.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: "user-1",
            role: { in: [OrganizationRole.ADMIN, OrganizationRole.OWNER] },
            organization: { arrangerId: { in: ["arranger-org-a"] } },
          },
        }),
      );
    });
  });

  describe("canView", () => {
    it("lets anyone read a public event", async () => {
      await expect(
        service.canView("event-1", EventVisibility.PUBLIC),
      ).resolves.toBe(true);
    });

    it("hides an event arranged by an unapproved organization from non-arrangers", async () => {
      prisma.eventArranger.findFirst.mockResolvedValueOnce({
        eventId: "event-1",
      });

      await expect(
        service.canView("event-1", EventVisibility.PUBLIC, "user-1"),
      ).resolves.toBe(false);
    });

    it("still shows an unapproved organization's event to its arranger", async () => {
      prisma.eventArranger.findFirst.mockResolvedValueOnce({
        eventId: "event-1",
      });

      await expect(
        service.canView("event-1", EventVisibility.PRIVATE, "user-1", true),
      ).resolves.toBe(true);
    });

    it("refuses a non-public event to an anonymous caller", async () => {
      await expect(
        service.canView("event-1", EventVisibility.UNLISTED),
      ).resolves.toBe(false);
    });

    it("lets an arranger read their own non-public event", async () => {
      await expect(
        service.canView("event-1", EventVisibility.PRIVATE, "user-1", true),
      ).resolves.toBe(true);
    });

    it.each([RegStatus.INVITED, RegStatus.GOING, RegStatus.WAITLISTED])(
      "lets a %s registration read a private event",
      async (regStatus) => {
        prisma.registration.findUnique.mockResolvedValueOnce({ regStatus });

        await expect(
          service.canView("event-1", EventVisibility.PRIVATE, "user-1"),
        ).resolves.toBe(true);
      },
    );

    it.each([RegStatus.NOT_GOING, RegStatus.BANNED])(
      "refuses a private event to a %s registration",
      async (regStatus) => {
        prisma.registration.findUnique.mockResolvedValueOnce({ regStatus });

        await expect(
          service.canView("event-1", EventVisibility.PRIVATE, "user-1"),
        ).resolves.toBe(false);
      },
    );

    it("refuses a private event to a user with no registration", async () => {
      prisma.registration.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.canView("event-1", EventVisibility.PRIVATE, "user-1"),
      ).resolves.toBe(false);
    });
  });

  describe("registrationGrantsEventAccess", () => {
    it.each([RegStatus.INVITED, RegStatus.GOING, RegStatus.WAITLISTED])(
      "grants a private event to %s",
      (regStatus) => {
        expect(
          service.registrationGrantsEventAccess(
            EventVisibility.PRIVATE,
            regStatus,
          ),
        ).toBe(true);
      },
    );

    /* Both statuses mean access has ended, and both used to keep returning
       the event row anyway. */
    it.each([RegStatus.NOT_GOING, RegStatus.BANNED])(
      "refuses a private event to %s",
      (regStatus) => {
        expect(
          service.registrationGrantsEventAccess(
            EventVisibility.PRIVATE,
            regStatus,
          ),
        ).toBe(false);
      },
    );

    /* canView gates UNLISTED exactly as it gates PRIVATE - the difference
       between the two lives in the registration gate, not in the read gate. */
    it("refuses an unlisted event to a banned user", () => {
      expect(
        service.registrationGrantsEventAccess(
          EventVisibility.UNLISTED,
          RegStatus.BANNED,
        ),
      ).toBe(false);
    });

    it.each([RegStatus.NOT_GOING, RegStatus.BANNED])(
      "still allows a public event to %s",
      (regStatus) => {
        expect(
          service.registrationGrantsEventAccess(
            EventVisibility.PUBLIC,
            regStatus,
          ),
        ).toBe(true);
      },
    );
  });

  describe("viewableEventIds", () => {
    const grants = (arranged: string[], registered: string[]) => {
      prisma.eventArranger.findMany.mockResolvedValue(
        arranged.map((eventId) => ({ eventId })),
      );
      prisma.registration.findMany.mockResolvedValue(
        registered.map((eventId) => ({ eventId })),
      );
    };

    it("returns nothing and issues no query for an empty list", async () => {
      grants([], []);

      expect(await service.viewableEventIds("u1", [])).toEqual(new Set());
      expect(prisma.eventArranger.findMany).not.toHaveBeenCalled();
      expect(prisma.registration.findMany).not.toHaveBeenCalled();
    });

    it("counts arranging an event as its own grant", async () => {
      grants(["e1"], []);

      expect(await service.viewableEventIds("u1", ["e1", "e2"])).toEqual(
        new Set(["e1"]),
      );
    });

    it("only asks the database about the ids it was given", async () => {
      grants([], []);
      await service.viewableEventIds("u1", ["e1", "e2"]);

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
      grants(["e1"], ["e1", "e2"]);

      expect(await service.viewableEventIds("u1", ["e1", "e2", "e3"])).toEqual(
        new Set(["e1", "e2"]),
      );
    });
  });
});
