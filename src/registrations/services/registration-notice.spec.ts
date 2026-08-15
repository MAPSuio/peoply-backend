import { BadRequestException } from "@nestjs/common";
import { CommonRegistrationService } from "./common.registrations.service";

/* Two ways this service told the caller the wrong thing: a 500 where a 400
   belonged, and an opt-out it never read. */
describe("CommonRegistrationService — what the caller is told", () => {
  const registration = { delete: jest.fn(), update: jest.fn() };
  const event = { findUnique: jest.fn() };
  const user = { findUnique: jest.fn() };
  const trx = { event, registration, user, $queryRaw: jest.fn() };
  const prisma = {
    $transaction: jest.fn((fn: any) => fn(trx)),
  } as any;
  const send = jest.fn();

  let service: CommonRegistrationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CommonRegistrationService(prisma, { send } as any);
  });

  describe("registration windows on remove()", () => {
    it("answers 400, not 500, when registration has closed", async () => {
      event.findUnique.mockResolvedValueOnce({
        id: "event-1",
        regEnd: new Date("2020-01-01"),
        registrations: [],
      });

      /* A bare Error is not an HttpException, so Nest rendered it as
         "Internal server error" and the caller learned nothing. */
      await expect(service.remove("user-1", "event-1")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("answers 400 when registration has not opened", async () => {
      event.findUnique.mockResolvedValueOnce({
        id: "event-1",
        regStart: new Date("2099-01-01"),
        registrations: [],
      });

      await expect(service.remove("user-1", "event-1")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("says why, rather than leaking an internal message", async () => {
      event.findUnique.mockResolvedValueOnce({
        id: "event-1",
        regEnd: new Date("2020-01-01"),
        registrations: [],
      });

      await expect(service.remove("user-1", "event-1")).rejects.toThrow(
        "Registration closed",
      );
    });
  });

  describe("waitlist promotion respects the waitlist opt-out", () => {
    const promote = (allowEmailOnWaitlist: boolean) => {
      event.findUnique.mockResolvedValueOnce({
        id: "event-1",
        title: "Fest",
        urlId: "ABCDEFGH",
        registrationMode: "PEOPLY",
        registrations: [
          { eventId: "event-1", userId: "user-1", regStatus: "GOING" },
          { eventId: "event-1", userId: "user-2", regStatus: "WAITLISTED" },
        ],
      });
      registration.update.mockResolvedValue({ regStatus: "NOT_GOING" });
      user.findUnique.mockResolvedValueOnce({
        id: "user-2",
        email: "neste@example.no",
        allowEmailFromArranger: true,
        allowEmailOnWaitlist,
      });

      return service.updateRegistration(
        "user-1",
        "event-1",
        "NOT_GOING" as any,
      );
    };

    it("mails the promoted user who wants waitlist mail", async () => {
      await promote(true);

      expect(send).toHaveBeenCalledTimes(1);
    });

    it("stays silent when the user opted out of waitlist mail", async () => {
      /* allowEmailOnWaitlist is offered in UpdateUserDto and stored, but was
         read nowhere - the check used the general arranger flag instead. */
      await promote(false);

      expect(send).not.toHaveBeenCalled();
    });

    it("still promotes the user either way", async () => {
      await promote(false);

      expect(registration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { regStatus: "GOING" },
        }),
      );
    });
  });
});
