import { RegStatus } from "../../generated/prisma/client";
import { ArrangerRegistrationService } from "./arranger.registrations.service";
import { CommonRegistrationService } from "./common.registrations.service";

/* PATCH /events/:id/registrations/:userId mails the target. The mail used to
   go out whether or not anything changed, which made it a send button. */
describe("ArrangerRegistrationService.update — mail on no-op", () => {
  const send = jest.fn();
  const prisma = {
    user: { findUnique: jest.fn() },
    event: { findUnique: jest.fn() },
  } as any;

  let service: ArrangerRegistrationService;
  let updateRegistration: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({
      email: "offer@example.no",
      allowEmailFromArranger: true,
    });
    prisma.event.findUnique.mockResolvedValue({
      title: "Fest",
      urlId: "ABCDEFGH",
    });
    service = new ArrangerRegistrationService(prisma, { send } as any);
    updateRegistration = jest.spyOn(
      CommonRegistrationService.prototype,
      "updateRegistration",
    );
  });

  afterEach(() => updateRegistration.mockRestore());

  it("mails when the status actually changed", async () => {
    updateRegistration.mockResolvedValueOnce({
      regStatus: RegStatus.NOT_GOING,
    });

    await service.update("user-1", "event-1", {
      regStatus: RegStatus.NOT_GOING,
    } as any);

    expect(send).toHaveBeenCalledTimes(1);
  });

  it("sends nothing when no branch matched", async () => {
    /* Exactly what a repeated PATCH to a status the user already holds
       returns: the transaction writes nothing and resolves undefined. */
    updateRegistration.mockResolvedValueOnce(undefined);

    await service.update("user-1", "event-1", {
      regStatus: RegStatus.NOT_GOING,
    } as any);

    expect(send).not.toHaveBeenCalled();
  });

  it("sends nothing on a repeated ban either", async () => {
    updateRegistration.mockResolvedValueOnce(undefined);

    await service.update("user-1", "event-1", {
      regStatus: RegStatus.BANNED,
    } as any);

    expect(send).not.toHaveBeenCalled();
  });

  it("mails on a ban that took effect", async () => {
    updateRegistration.mockResolvedValueOnce({ regStatus: RegStatus.BANNED });

    await service.update("user-1", "event-1", {
      regStatus: RegStatus.BANNED,
    } as any);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].content.subject).toContain("utestengt");
  });

  it("still respects the recipient's opt-out", async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      email: "offer@example.no",
      allowEmailFromArranger: false,
    });
    updateRegistration.mockResolvedValueOnce({
      regStatus: RegStatus.NOT_GOING,
    });

    await service.update("user-1", "event-1", {
      regStatus: RegStatus.NOT_GOING,
    } as any);

    expect(send).not.toHaveBeenCalled();
  });

  it("returns whatever the underlying update returned", async () => {
    updateRegistration.mockResolvedValueOnce(undefined);

    await expect(
      service.update("user-1", "event-1", {
        regStatus: RegStatus.NOT_GOING,
      } as any),
    ).resolves.toBeUndefined();
  });
});
