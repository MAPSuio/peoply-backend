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
  phoneNumbers,
  firstNames,
  lastNames,
  eventNames,
  emails,
  capacities,
  eventDescriptions,
  birthDates,
  eventIDs,
  allergens,
} from "./dbTestData";
const prisma = new PrismaClient();

const ifiOrganizations = [
  { name: "CYB", orgNr: "990110352" },
  { name: "Navet", orgNr: "990995303" },
  { name: "Dagen", orgNr: "987042583" },
  { name: "Ifi-Progsys", orgNr: "911594242" },
  { name: "Defi", orgNr: "915439721" },
  { name: "Digitus", orgNr: "919650354" },
  { name: "Språktek", orgNr: "997875400" },
  { name: "Mikro", orgNr: "991739815" },
  { name: "MAPS", orgNr: "995251884" },
  { name: "Toastjærn", orgNr: "920547230" },
];

function getFutureEventDates(index: number) {
  const startDate = new Date();
  startDate.setHours(16 + (index % 3), 0, 0, 0);
  startDate.setDate(startDate.getDate() + index + 1);

  const endDate = new Date(startDate);
  endDate.setHours(endDate.getHours() + 4);

  const regStart = new Date(startDate);
  regStart.setDate(regStart.getDate() - 14);

  const regEnd = new Date(startDate);
  regEnd.setHours(regEnd.getHours() - 2);

  return { startDate, endDate, regStart, regEnd };
}

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
      update: {
        name: ifiOrganizations[i].name,
        orgNr: ifiOrganizations[i].orgNr,
      },
      create: {
        id: organisationIDs[i],
        arrangerId: arrangerIDs[i],
        name: ifiOrganizations[i].name,
        orgNr: ifiOrganizations[i].orgNr,
      },
    });

    let visibility: EventVisibility = EventVisibility.PUBLIC;
    if (i !== 0 && i % 2 === 0) {
      visibility = EventVisibility.UNLISTED;
    }

    const { startDate, endDate, regStart, regEnd } = getFutureEventDates(i);

    await prisma.event.upsert({
      where: {
        id: eventIDs[i],
      },
      update: {
        startDate,
        endDate,
        regStart,
        regEnd,
        title: eventNames[i],
        description: eventDescriptions[i],
        capacity: capacities[i],
        visibility,
        featured: i === 0,
        locationName: "Forskningsparken, Oslo",
        freeformAddress: "Gaustadalleen 21, 0349 Oslo",
      },
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
        startDate,
        endDate,
        regStart,
        regEnd,
        title: eventNames[i],
        description: eventDescriptions[i],
        capacity: capacities[i],
        visibility,
        featured: i === 0,
        locationName: "Forskningsparken, Oslo",
        freeformAddress: "Gaustadalleen 21, 0349 Oslo",
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
