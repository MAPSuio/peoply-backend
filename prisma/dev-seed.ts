import {
  PrismaClient,
  EventArrangerRole,
  OrganizationRole,
  RegStatus,
  EventVisibility,
} from ".prisma/client";
import { categories } from "./dbProdData";
import {
  arrangerIDs,
  userIDs,
  organisationIDs,
  organisationNumbers,
  phoneNumbers,
  firstNames,
  lastNames,
  eventNames,
  companyNames,
  emails,
  capacities,
  eventDescriptions,
  birthDates,
  eventIDs,
  allergens,
} from "./dbTestData";
import { randomInt } from "crypto";

const prisma = new PrismaClient();

async function main() {
  for (let i = 0; i < 10; i++) {
    await prisma.arranger.upsert({
      where: {
        id: arrangerIDs[i],
      },
      update: {},
      create: {
        id: arrangerIDs[i],
        isBusiness: true,
      },
    });
    await prisma.arranger.upsert({
      where: {
        id: arrangerIDs[i + 10],
      },
      update: {},
      create: {
        id: arrangerIDs[i + 10],
        isBusiness: false,
      },
    });
    await prisma.arranger.upsert({
      where: {
        id: arrangerIDs[i + 20],
      },
      update: {},
      create: {
        id: arrangerIDs[i + 20],
        isBusiness: false,
      },
    });

    await prisma.user.upsert({
      where: {
        id: userIDs[i],
      },
      update: {},
      create: {
        id: userIDs[i],
        arrangerId: arrangerIDs[i],
        phone: phoneNumbers[i],
        firstName: firstNames[i],
        lastName: lastNames[i],
        email: emails[i],
        birthDate: birthDates[i],
      },
    });

    await prisma.user.upsert({
      where: {
        id: userIDs[i + 10],
      },
      update: {},
      create: {
        id: userIDs[i + 10],
        arrangerId: arrangerIDs[i + 10],
        phone: phoneNumbers[i + 10],
        firstName: firstNames[i + 10],
        lastName: lastNames[i + 10],
        email: emails[i + 10],
        birthDate: birthDates[i],
      },
    });

    await prisma.user.upsert({
      where: {
        id: userIDs[i + 20],
      },
      update: {},
      create: {
        id: userIDs[i + 20],
        arrangerId: arrangerIDs[i + 20],
        phone: phoneNumbers[i + 20],
        firstName: firstNames[i + 20],
        lastName: lastNames[i + 20],
        email: emails[i + 20],
        birthDate: birthDates[i],
      },
    });

    await prisma.organization.upsert({
      where: {
        id: organisationIDs[i],
      },
      update: {},
      create: {
        id: organisationIDs[i],
        arrangerId: arrangerIDs[i],
        name: companyNames[i],
        orgNr: organisationNumbers[i],
      },
    });

    let visibility: EventVisibility = EventVisibility.PUBLIC;
    if (i % 2 === 0) {
      visibility = EventVisibility.UNLISTED;
    }

    const startDate = new Date().getTime() + randomInt(1000 * 60 * 60 * 9);
    const endDate =
      new Date(startDate).getTime() + randomInt(1000 * 60 * 60 * 3);

    await prisma.event.upsert({
      where: {
        id: eventIDs[i],
      },
      update: {},
      create: {
        id: eventIDs[i],
        urlId: (() => {
          const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
          let urlId = "";
          for (let i = 0; i < 8; i++) {
            urlId += letters.charAt(Math.floor(Math.random() * letters.length));
          }

          return urlId;
        })(),
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        title: eventNames[i],
        description: eventDescriptions[i],
        capacity: capacities[i],
        visibility: visibility,
        locationName: "locationName",
      },
    });

    await prisma.eventArranger.upsert({
      where: {
        eventId_arrangerId: {
          eventId: eventIDs[i],
          arrangerId: arrangerIDs[i],
        },
      },
      update: {},
      create: {
        eventId: eventIDs[i],
        arrangerId: arrangerIDs[i],
        role: EventArrangerRole.ADMIN,
      },
    });

    await prisma.userOrganizationRole.upsert({
      where: {
        organizationId_userId: {
          organizationId: organisationIDs[i],
          userId: userIDs[i],
        },
      },
      update: {},
      create: {
        organizationId: organisationIDs[i],
        userId: userIDs[i],
        role: OrganizationRole.ADMIN,
      },
    });

    await prisma.registration.upsert({
      where: {
        eventId_userId: { eventId: eventIDs[i], userId: userIDs[i + 10] },
      },
      update: {},
      create: {
        eventId: eventIDs[i],
        userId: userIDs[i + 10],
        regStatus: RegStatus.INVITED,
      },
    });

    await prisma.registration.upsert({
      where: {
        eventId_userId: { eventId: eventIDs[i], userId: userIDs[i + 20] },
      },
      update: {},
      create: {
        eventId: eventIDs[i],
        userId: userIDs[i + 20],
        regStatus: RegStatus.GOING,
      },
    });

    await prisma.favorite.upsert({
      where: {
        eventId_userId: { eventId: eventIDs[i], userId: userIDs[i + 20] },
      },
      update: {},
      create: {
        eventId: eventIDs[i],
        userId: userIDs[i + 20],
      },
    });
  }

  /* add sample categories */
  await prisma.category.createMany({
    data: categories,
    skipDuplicates: true,
  });

  await prisma.allergen.createMany({
    data: allergens,
    skipDuplicates: true,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
