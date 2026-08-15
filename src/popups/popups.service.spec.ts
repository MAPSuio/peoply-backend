import { HttpStatus } from "@nestjs/common";
import { PopupsService } from "./popups.service";

describe("PopupsService", () => {
  const popup = {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const trx = { popup, $queryRaw: jest.fn() };
  const prisma = {
    popup,
    $transaction: jest.fn((fn: any) => fn(trx)),
  };
  let service: PopupsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PopupsService(prisma as any);
  });

  it("lists popups chronologically", async () => {
    popup.findMany.mockResolvedValueOnce([]);

    await service.findAll();

    expect(popup.findMany).toHaveBeenCalledWith({
      orderBy: { startsAt: "asc" },
    });
  });

  it("uses a half-open interval for the active popup", async () => {
    const now = new Date("2026-08-15T12:00:00.000Z");
    popup.findFirst.mockResolvedValueOnce(null);

    await service.findActive(now);

    expect(popup.findFirst).toHaveBeenCalledWith({
      where: {
        startsAt: { lte: now },
        endsAt: { gt: now },
      },
    });
  });

  it("creates a popup after locking and checking the interval", async () => {
    popup.findFirst.mockResolvedValueOnce(null);
    popup.create.mockResolvedValueOnce({ id: "popup-1" });

    await expect(
      service.create({
        title: "Viktig beskjed",
        body: "Første avsnitt.\n\nAndre avsnitt.",
        startsAt: "2026-08-16T10:00:00.000Z",
        endsAt: "2026-08-16T12:00:00.000Z",
      }),
    ).resolves.toEqual({ id: "popup-1" });

    expect(trx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(popup.findFirst).toHaveBeenCalledWith({
      where: {
        id: undefined,
        startsAt: { lt: new Date("2026-08-16T12:00:00.000Z") },
        endsAt: { gt: new Date("2026-08-16T10:00:00.000Z") },
      },
      select: { id: true, title: true, startsAt: true, endsAt: true },
    });
    expect(popup.create).toHaveBeenCalledWith({
      data: {
        title: "Viktig beskjed",
        body: "Første avsnitt.\n\nAndre avsnitt.",
        startsAt: new Date("2026-08-16T10:00:00.000Z"),
        endsAt: new Date("2026-08-16T12:00:00.000Z"),
      },
    });
  });

  it("rejects an empty or reversed interval before writing", () => {
    expect(() =>
      service.create({
        title: "Viktig beskjed",
        body: "Tekst",
        startsAt: "2026-08-16T12:00:00.000Z",
        endsAt: "2026-08-16T12:00:00.000Z",
      }),
    ).toThrow(expect.objectContaining({ status: HttpStatus.BAD_REQUEST }));

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects overlapping intervals and names the popup it collided with", async () => {
    const existing = {
      id: "existing-popup",
      title: "Fadderuka",
      startsAt: new Date("2026-08-16T09:00:00.000Z"),
      endsAt: new Date("2026-08-16T11:00:00.000Z"),
    };
    popup.findFirst.mockResolvedValueOnce(existing);

    await expect(
      service.create({
        title: "Viktig beskjed",
        body: "Tekst",
        startsAt: "2026-08-16T10:00:00.000Z",
        endsAt: "2026-08-16T12:00:00.000Z",
      }),
    ).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
      /* The admin has to be able to find it - a bare "overlaps another popup"
         is unactionable when the other popup is not on screen. */
      response: {
        message: "Tidsrommet overlapper «Fadderuka»",
        conflictingPopup: existing,
      },
    });

    expect(popup.create).not.toHaveBeenCalled();
  });

  it("merges a partial date update and excludes itself from overlap checks", async () => {
    popup.findUnique.mockResolvedValueOnce({
      id: "popup-1",
      title: "Tittel",
      body: "Tekst",
      startsAt: new Date("2026-08-16T10:00:00.000Z"),
      endsAt: new Date("2026-08-16T12:00:00.000Z"),
    });
    popup.findFirst.mockResolvedValueOnce(null);
    popup.update.mockResolvedValueOnce({ id: "popup-1" });

    await service.update("popup-1", {
      endsAt: "2026-08-16T13:00:00.000Z",
    });

    expect(popup.findFirst).toHaveBeenCalledWith({
      where: {
        id: { not: "popup-1" },
        startsAt: { lt: new Date("2026-08-16T13:00:00.000Z") },
        endsAt: { gt: new Date("2026-08-16T10:00:00.000Z") },
      },
      select: { id: true, title: true, startsAt: true, endsAt: true },
    });
    expect(popup.update).toHaveBeenCalledWith({
      where: { id: "popup-1" },
      data: {
        endsAt: new Date("2026-08-16T13:00:00.000Z"),
        startsAt: undefined,
      },
    });
  });

  it("returns 404 when updating or deleting a missing popup", async () => {
    popup.findUnique.mockResolvedValue(null);

    await expect(
      service.update("missing", { title: "Ny tittel" }),
    ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    await expect(service.remove("missing")).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
    });
  });

  it("serializes deletion with other popup mutations", async () => {
    popup.findUnique.mockResolvedValueOnce({ id: "popup-1" });
    popup.delete.mockResolvedValueOnce({ id: "popup-1" });

    await service.remove("popup-1");

    expect(trx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(popup.delete).toHaveBeenCalledWith({ where: { id: "popup-1" } });
    expect(trx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      popup.findUnique.mock.invocationCallOrder[0],
    );
  });
});
