import { ConflictException } from "@nestjs/common";
import { PopupsService } from "./popups.service";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Drives PopupsService against a real Postgres, because the unit spec cannot
 * see the bug that took every popup write down in production.
 *
 * That spec mocks the transaction client, so `trx.$queryRaw` was whatever the
 * mock returned and the suite stayed green while `POST /popups` answered 500
 * for weeks:
 *
 *   P2010: Invalid `prisma.$queryRaw()` invocation:
 *   Failed to deserialize column of type 'void'.
 *
 * `pg_advisory_xact_lock()` returns void, and $queryRaw deserializes a result
 * set. Only a real driver against a real server can tell the two raw helpers
 * apart, so the lock is exercised here rather than asserted over a mock.
 */
describe("PopupsService against Postgres", () => {
  const prisma = new PrismaService();
  const service = new PopupsService(prisma);

  const inMinutes = (minutes: number) =>
    new Date(Date.now() + minutes * 60_000).toISOString();

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    await prisma.popup.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("takes the advisory lock without failing to deserialize void", async () => {
    /* The regression, isolated: this exact statement through $queryRaw is
       what P2010'd. Nothing about it is popup-specific - it is the shape of
       the call that matters. */
    await expect(
      prisma.$executeRaw`SELECT pg_advisory_xact_lock(1886351477)`,
    ).resolves.toBeDefined();
  });

  it("creates, reads back and deletes a popup end to end", async () => {
    const created = await service.create({
      /* Emoji on purpose: 4-byte UTF-8 through the driver into varchar was
         suspected while the real cause was still unknown. */
      title: "Peoply er open source! 🎉",
      body: "Første avsnitt 🚀\n\nAndre avsnitt ✨",
      startsAt: inMinutes(-1),
      endsAt: inMinutes(60),
    });

    expect(created.id).toEqual(expect.any(String));
    expect(created.title).toBe("Peoply er open source! 🎉");

    /* The homepage path: a popup live right now has to come back, or the app
       shows nothing and the create looks like it did nothing. */
    await expect(service.findActive()).resolves.toMatchObject({
      id: created.id,
    });

    await service.update(created.id, { title: "Endret tittel 🎊" });
    await expect(service.findAll()).resolves.toMatchObject([
      { title: "Endret tittel 🎊" },
    ]);

    await service.remove(created.id);
    await expect(service.findAll()).resolves.toEqual([]);
  });

  it("answers an overlapping interval with a 409 naming the other popup", async () => {
    const existing = await service.create({
      title: "Fadderuka",
      body: "Tekst",
      startsAt: inMinutes(-1),
      endsAt: inMinutes(60),
    });

    const overlapping = service.create({
      title: "Kolliderende",
      body: "Tekst",
      startsAt: inMinutes(10),
      endsAt: inMinutes(120),
    });

    await expect(overlapping).rejects.toBeInstanceOf(ConflictException);
    await expect(overlapping).rejects.toMatchObject({
      response: {
        message: "Tidsrommet overlapper «Fadderuka»",
        conflictingPopup: { id: existing.id, title: "Fadderuka" },
      },
    });
  });

  it("allows a back-to-back interval, since the range is half open", async () => {
    await service.create({
      title: "Først",
      body: "Tekst",
      startsAt: inMinutes(0),
      endsAt: inMinutes(60),
    });

    await expect(
      service.create({
        title: "Rett etter",
        body: "Tekst",
        startsAt: inMinutes(60),
        endsAt: inMinutes(120),
      }),
    ).resolves.toMatchObject({ title: "Rett etter" });
  });
});
