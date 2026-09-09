import { randomUUID } from "node:crypto";
import { EventVisibility, RegStatus } from "../generated/prisma/client";
import { EventAccessService } from "../event-access/event-access.service";
import { FavoritesService } from "../favorites/favorites.service";
import { PrismaService } from "../prisma/prisma.service";
import { UserRegistrationService } from "../registrations/services/user.registrations.service";

const TWO_GOING_AND_TWO_NOT = [
  RegStatus.GOING,
  RegStatus.GOING,
  RegStatus.INVITED,
  RegStatus.NOT_GOING,
];

const GOING_AMONG_THEM = 2;

describe("the goingCount on a user's own lists, against Postgres", () => {
  const prisma = new PrismaService();
  const eventAccess = new EventAccessService(prisma);
  const favorites = new FavoritesService(prisma, eventAccess);
  const registrations = new UserRegistrationService(
    prisma,
    {} as any,
    eventAccess,
  );

  const createdArrangerIds: string[] = [];
  const createdEventIds: string[] = [];

  async function createUser(firstName: string) {
    const arranger = await prisma.arranger.create({
      data: { isBusiness: false },
    });
    createdArrangerIds.push(arranger.id);

    return prisma.user.create({
      data: {
        arrangerId: arranger.id,
        firstName,
        lastName: "Teller",
        email: `going-count-${randomUUID()}@peoply.app`,
      },
    });
  }

  async function createEventRegisteredAs(statuses: RegStatus[]) {
    const event = await prisma.event.create({
      data: {
        urlId: `going-count-${randomUUID()}`,
        startDate: new Date(Date.now() + 86_400_000),
        title: "Kodekveld",
        description: "Teller bare de som kommer.",
        visibility: EventVisibility.PUBLIC,
        locationName: "Forskningsparken",
      },
    });
    createdEventIds.push(event.id);

    for (const regStatus of statuses) {
      const attendee = await createUser("Deltaker");
      await prisma.registration.create({
        data: { eventId: event.id, userId: attendee.id, regStatus },
      });
    }

    return event;
  }

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    await prisma.event.deleteMany({ where: { id: { in: createdEventIds } } });
    await prisma.arranger.deleteMany({
      where: { id: { in: createdArrangerIds } },
    });
    createdEventIds.length = 0;
    createdArrangerIds.length = 0;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("counts only the going registrations on a favourited event, not every registration", async () => {
    const event = await createEventRegisteredAs(TWO_GOING_AND_TWO_NOT);
    const viewer = await createUser("Favoritt");
    await prisma.favorite.create({
      data: { eventId: event.id, userId: viewer.id },
    });

    const [favorite] = (await favorites.findAll(
      { includeEvent: true } as any,
      viewer.id,
    )) as any[];

    expect(favorite.event.goingCount).toBe(GOING_AMONG_THEM);
    expect(favorite.event._count).toBeUndefined();
  });

  it("leaves the viewer's own not-going registration out of the count", async () => {
    const event = await createEventRegisteredAs(TWO_GOING_AND_TWO_NOT);
    const viewer = await createUser("Paameldt");
    await prisma.registration.create({
      data: {
        eventId: event.id,
        userId: viewer.id,
        regStatus: RegStatus.NOT_GOING,
      },
    });

    const [registration] = (await registrations.findAll(
      { includeEvent: true } as any,
      viewer.id,
    )) as any[];

    expect(registration.event.goingCount).toBe(GOING_AMONG_THEM);
    expect(registration.event._count).toBeUndefined();
  });
});
