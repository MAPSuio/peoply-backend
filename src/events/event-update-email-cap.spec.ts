import { HttpException } from "@nestjs/common";
import { EventsService } from "./events.service";

/* Each emailing update is a BCC to every attendee, so the 5-per-24h cap is
   the only bound on how often an arranger can reach them. */
describe("EventsService.sendUpdateToEvent — the daily email cap", () => {
  const eventUpdate = {
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const registration = { findMany: jest.fn() };
  const trx = { $queryRaw: jest.fn(), eventUpdate };
  const prisma = {
    eventUpdate,
    registration,
    $transaction: jest.fn((fn: any) => fn(trx)),
  } as any;
  const send = jest.fn();

  let service: EventsService;

  const dto = {
    subject: "Endret rom",
    body: "Nytt rom",
    visibility: "GOING",
    sendEmail: true,
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    eventUpdate.count.mockResolvedValue(0);
    eventUpdate.create.mockResolvedValue({ id: "update-1" });
    registration.findMany.mockResolvedValue([
      { user: { email: "a@b.no", allowEmailFromArranger: true } },
    ]);
    send.mockResolvedValue({ messageId: "msg-1" });
    service = new EventsService(
      prisma,
      {} as any,
      {} as any,
      {
        send,
      } as any,
    );
    jest
      .spyOn(service, "findOneWithArrangers")
      .mockResolvedValue({ id: "event-1", title: "Fest" } as any);
  });

  it("locks the event row before counting", async () => {
    await service.sendUpdateToEventParticipants("user-1", "event-1", dto);

    /* Without the lock two requests read the same count and both pass. */
    expect(trx.$queryRaw).toHaveBeenCalled();
    const lockOrder = trx.$queryRaw.mock.invocationCallOrder[0];
    const countOrder = eventUpdate.count.mock.invocationCallOrder[0];
    expect(lockOrder).toBeLessThan(countOrder);
  });

  it("reserves the slot before sending, not after", async () => {
    await service.sendUpdateToEventParticipants("user-1", "event-1", dto);

    /* The row that increments the count used to be written after the send,
       so every concurrent request got through. */
    const created = eventUpdate.create.mock.invocationCallOrder[0];
    const sent = send.mock.invocationCallOrder[0];
    expect(created).toBeLessThan(sent);
  });

  it("counts and reserves inside one transaction", async () => {
    await service.sendUpdateToEventParticipants("user-1", "event-1", dto);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("refuses once the cap is reached and sends nothing", async () => {
    eventUpdate.count.mockResolvedValueOnce(5);

    await expect(
      service.sendUpdateToEventParticipants("user-1", "event-1", dto),
    ).rejects.toThrow(HttpException);

    expect(send).not.toHaveBeenCalled();
    expect(eventUpdate.create).not.toHaveBeenCalled();
  });

  it("still allows the fifth update through", async () => {
    eventUpdate.count.mockResolvedValueOnce(4);

    await service.sendUpdateToEventParticipants("user-1", "event-1", dto);

    expect(send).toHaveBeenCalledTimes(1);
  });

  it("sends nothing when no attendee has opted in", async () => {
    registration.findMany.mockResolvedValueOnce([
      { user: { email: "a@b.no", allowEmailFromArranger: false } },
    ]);

    await service.sendUpdateToEventParticipants("user-1", "event-1", dto);

    /* The old check read `toEmails.to.length`, a hardcoded 1-element array,
       so an empty BCC still produced a send. */
    expect(send).not.toHaveBeenCalled();
  });

  it("attaches the provider message id to the reserved row", async () => {
    await service.sendUpdateToEventParticipants("user-1", "event-1", dto);

    expect(eventUpdate.update).toHaveBeenCalledWith({
      where: { id: "update-1" },
      data: { azureMessageId: "msg-1" },
    });
  });

  it("writes exactly one row for an emailing update", async () => {
    await service.sendUpdateToEventParticipants("user-1", "event-1", dto);

    expect(eventUpdate.create).toHaveBeenCalledTimes(1);
  });

  it("still writes the update when no email was requested", async () => {
    await service.sendUpdateToEventParticipants("user-1", "event-1", {
      ...dto,
      sendEmail: false,
    });

    expect(eventUpdate.create).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
