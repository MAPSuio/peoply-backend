import { ForbiddenException } from "@nestjs/common";
import { EventInvitationsService } from "./eventInvitations.service";

/* An invitation is what authorises attendance on an invite-only event, so
   spending or revoking one has to actually take the attendance away. */
describe("EventInvitationsService — invitation revocation", () => {
  const futureEvent = {
    id: "event-1",
    endDate: new Date("2099-01-01"),
    regStart: null,
    regEnd: null,
    registrationMode: "PEOPLY",
    hasFood: false,
  };

  const eventInvitation = {
    updateMany: jest.fn(),
    update: jest.fn(),
  };
  const registration = { updateMany: jest.fn() };
  const trx = {
    event: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    eventInvitation,
    registration,
  };
  const prisma = {
    $transaction: jest.fn((fn: any) => fn(trx)),
  } as any;
  const userRegistrationsService = { update: jest.fn() } as any;

  let service: EventInvitationsService;

  beforeEach(() => {
    trx.event.findUnique.mockResolvedValue(futureEvent);
    trx.user.findUnique.mockResolvedValue({ id: "user-1" });
    registration.updateMany.mockResolvedValue({ count: 1 });
    service = new EventInvitationsService(
      prisma,
      userRegistrationsService,
      {} as any,
    );
  });

  describe("accepting", () => {
    it("registers the user when a pending invitation was consumed", async () => {
      eventInvitation.updateMany.mockResolvedValueOnce({ count: 1 });

      await service.acceptInvitationsToEvent("event-1", "user-1");

      expect(userRegistrationsService.update).toHaveBeenCalledWith("user-1", {
        eventId: "event-1",
        regStatus: "GOING",
        formAnswer: undefined,
      });
    });

    it("refuses when no pending invitation matched", async () => {
      /* What a replayed accept looks like after the invitation was declined,
         ignored, or cancelled by the arranger. */
      eventInvitation.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        service.acceptInvitationsToEvent("event-1", "user-1"),
      ).rejects.toThrow(ForbiddenException);
    });

    it("does not touch the registration when nothing matched", async () => {
      eventInvitation.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        service.acceptInvitationsToEvent("event-1", "user-1"),
      ).rejects.toThrow();

      /* The bug was that this ran regardless, driving a declined invitee to
         GOING while the invitation row still read DECLINED. */
      expect(userRegistrationsService.update).not.toHaveBeenCalled();
    });
  });
});
