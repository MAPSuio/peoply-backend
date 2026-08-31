import {
  EventArrangerRole,
  InvitationStatus,
  OrganizationRole,
} from "../../generated/prisma/client";
import { EventCoOrganizerInvitationsService } from "./eventCoOrganizerInvitations.service";

describe("EventCoOrganizerInvitationsService", () => {
  const prisma = {
    $transaction: jest.fn(),
    eventCoOrganizerInvitation: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
      upsert: jest.fn(),
    },
    eventArranger: {
      deleteMany: jest.fn(),
      upsert: jest.fn(),
    },
    organization: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    userOrganizationRole: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  } as any;

  let service: EventCoOrganizerInvitationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(
      (callback: (client: typeof prisma) => unknown) => callback(prisma),
    );
    prisma.eventCoOrganizerInvitation.updateMany.mockResolvedValue({
      count: 1,
    });
    service = new EventCoOrganizerInvitationsService(prisma);
  });

  describe("who may answer for an organization", () => {
    it.each([OrganizationRole.ADMIN, OrganizationRole.OWNER])(
      "lets a %s answer",
      async (role) => {
        prisma.userOrganizationRole.findUnique.mockResolvedValueOnce({ role });

        await expect(
          service.canRespondOnBehalfOf("user-1", "org-1"),
        ).resolves.toBe(true);
      },
    );

    it("refuses a plain member", async () => {
      // Accepting puts the organization's name and logo on someone else's
      // event. Sending an organization invitation and editing the
      // organization's events are both ADMIN/OWNER; this is the same
      // authority and must not be reachable one rung lower.
      prisma.userOrganizationRole.findUnique.mockResolvedValueOnce({
        role: OrganizationRole.MEMBER,
      });

      await expect(
        service.canRespondOnBehalfOf("user-1", "org-1"),
      ).resolves.toBe(false);
    });

    it("refuses someone with no role in the organization", async () => {
      prisma.userOrganizationRole.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.canRespondOnBehalfOf("outsider", "org-1"),
      ).resolves.toBe(false);
    });
  });

  describe("notifications", () => {
    it("only looks at organizations the user administers", async () => {
      prisma.userOrganizationRole.findMany.mockResolvedValueOnce([
        { organizationId: "org-1" },
      ]);
      prisma.eventCoOrganizerInvitation.findMany.mockResolvedValueOnce([]);

      await service.findAllPendingForUser("user-1");

      expect(prisma.userOrganizationRole.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: "user-1",
            role: {
              in: [OrganizationRole.ADMIN, OrganizationRole.OWNER],
            },
          },
        }),
      );
      expect(prisma.eventCoOrganizerInvitation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organizationId: { in: ["org-1"] },
            invitationStatus: InvitationStatus.PENDING,
          },
        }),
      );
    });

    it("skips the invitation query for a user who administers nothing", async () => {
      prisma.userOrganizationRole.findMany.mockResolvedValueOnce([]);

      await expect(service.findAllPendingForUser("user-1")).resolves.toEqual(
        [],
      );
      expect(prisma.eventCoOrganizerInvitation.findMany).not.toHaveBeenCalled();
    });
  });

  describe("responding", () => {
    const invitation = {
      id: "invitation-1",
      eventId: "event-1",
      organizationId: "org-1",
      invitationStatus: InvitationStatus.PENDING,
    };

    it("attaches the organization as a collaborator only on accept", async () => {
      prisma.eventCoOrganizerInvitation.findUnique.mockResolvedValueOnce(
        invitation,
      );
      prisma.organization.findUnique.mockResolvedValueOnce({
        arrangerId: "org-arranger-1",
      });

      await service.respond(
        "invitation-1",
        InvitationStatus.ACCEPTED,
        "user-1",
      );

      expect(prisma.eventArranger.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: {
            eventId: "event-1",
            arrangerId: "org-arranger-1",
            role: EventArrangerRole.COLLABORATOR,
          },
          // An organization that already runs the event keeps its ADMIN row —
          // accepting a collaboration must never demote it.
          update: {},
        }),
      );
    });

    it("does not accept when the invited organization no longer exists", async () => {
      prisma.eventCoOrganizerInvitation.findUnique.mockResolvedValueOnce(
        invitation,
      );
      prisma.organization.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.respond("invitation-1", InvitationStatus.ACCEPTED, "user-1"),
      ).rejects.toThrow("The invited organization no longer exists");

      expect(prisma.eventArranger.upsert).not.toHaveBeenCalled();
    });

    it("attaches nobody when the invitation is ignored", async () => {
      prisma.eventCoOrganizerInvitation.findUnique.mockResolvedValueOnce(
        invitation,
      );

      await service.respond("invitation-1", InvitationStatus.IGNORED, "user-1");

      expect(prisma.eventArranger.upsert).not.toHaveBeenCalled();
      expect(prisma.eventArranger.deleteMany).not.toHaveBeenCalled();
    });

    it.each([InvitationStatus.DECLINED, InvitationStatus.CANCELLED])(
      "detaches the organization on %s",
      async (status) => {
        prisma.eventCoOrganizerInvitation.findUnique.mockResolvedValueOnce({
          ...invitation,
          invitationStatus: status,
        });
        prisma.organization.findMany.mockResolvedValueOnce([
          { arrangerId: "org-arranger-1" },
        ]);

        await service.respond("invitation-1", status, "user-1");

        expect(prisma.eventArranger.deleteMany).toHaveBeenCalledWith({
          where: {
            eventId: "event-1",
            role: EventArrangerRole.COLLABORATOR,
            arrangerId: { in: ["org-arranger-1"] },
          },
        });
      },
    );

    it("records who answered", async () => {
      prisma.eventCoOrganizerInvitation.findUnique.mockResolvedValueOnce(
        invitation,
      );

      await service.respond("invitation-1", InvitationStatus.IGNORED, "user-1");

      expect(prisma.eventCoOrganizerInvitation.updateMany).toHaveBeenCalledWith(
        {
          where: {
            id: "invitation-1",
            invitationStatus: { in: [InvitationStatus.PENDING] },
          },
          data: {
            invitationStatus: InvitationStatus.IGNORED,
            respondedByUserId: "user-1",
          },
        },
      );
    });

    it("allows cancellation from PENDING or ACCEPTED", async () => {
      prisma.eventCoOrganizerInvitation.findUnique.mockResolvedValueOnce({
        ...invitation,
        invitationStatus: InvitationStatus.CANCELLED,
      });
      prisma.organization.findMany.mockResolvedValueOnce([]);

      await service.respond(
        "invitation-1",
        InvitationStatus.CANCELLED,
        "event-admin",
      );

      expect(prisma.eventCoOrganizerInvitation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: "invitation-1",
            invitationStatus: {
              in: [InvitationStatus.PENDING, InvitationStatus.ACCEPTED],
            },
          },
        }),
      );
    });

    it("performs no side effects when another response won the race", async () => {
      prisma.eventCoOrganizerInvitation.updateMany.mockResolvedValueOnce({
        count: 0,
      });

      await expect(
        service.respond("invitation-1", InvitationStatus.ACCEPTED, "user-1"),
      ).rejects.toThrow("Invitation status is not valid for this transition");

      expect(
        prisma.eventCoOrganizerInvitation.findUnique,
      ).not.toHaveBeenCalled();
      expect(prisma.eventArranger.upsert).not.toHaveBeenCalled();
      expect(prisma.eventArranger.deleteMany).not.toHaveBeenCalled();
    });

    it("lets only one of two concurrent organization responses transition PENDING", async () => {
      prisma.eventCoOrganizerInvitation.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });
      prisma.eventCoOrganizerInvitation.findUnique.mockResolvedValueOnce({
        ...invitation,
        invitationStatus: InvitationStatus.ACCEPTED,
      });
      prisma.organization.findUnique.mockResolvedValueOnce({
        arrangerId: "org-arranger-1",
      });

      const results = await Promise.allSettled([
        service.respond("invitation-1", InvitationStatus.ACCEPTED, "admin-1"),
        service.respond("invitation-1", InvitationStatus.DECLINED, "admin-2"),
      ]);

      expect(results.map(({ status }) => status).sort()).toEqual([
        "fulfilled",
        "rejected",
      ]);
      expect(prisma.eventArranger.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.eventArranger.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe("isOrganizationResponse", () => {
    it.each([
      InvitationStatus.ACCEPTED,
      InvitationStatus.DECLINED,
      InvitationStatus.IGNORED,
    ])("accepts %s", (status) => {
      expect(service.isOrganizationResponse(status)).toBe(true);
    });

    it("rejects CANCELLED, which belongs to the event admin", () => {
      expect(service.isOrganizationResponse(InvitationStatus.CANCELLED)).toBe(
        false,
      );
    });

    it("rejects PENDING, which is not an answer", () => {
      expect(service.isOrganizationResponse(InvitationStatus.PENDING)).toBe(
        false,
      );
    });
  });

  describe("findAllPendingForUser", () => {
    beforeEach(() => {
      prisma.userOrganizationRole.findMany.mockResolvedValue([
        { organizationId: "org-1" },
      ]);
      prisma.eventCoOrganizerInvitation.findMany.mockResolvedValue([]);
    });

    it("asks for the newest rows the caller needs and no more", async () => {
      await service.findAllPendingForUser("user-1", 10);

      expect(
        prisma.eventCoOrganizerInvitation.findMany.mock.calls[0][0],
      ).toMatchObject({ take: 10 });
    });

    it("orders on a unique column too, so a page cannot repeat a row", async () => {
      await service.findAllPendingForUser("user-1", 10);

      expect(
        prisma.eventCoOrganizerInvitation.findMany.mock.calls[0][0].orderBy,
      ).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    });

    it("never bounds the roles that decide which organizations count", async () => {
      await service.findAllPendingForUser("user-1", 10);

      expect(
        prisma.userOrganizationRole.findMany.mock.calls[0][0].take,
      ).toBeUndefined();
    });
  });
});
