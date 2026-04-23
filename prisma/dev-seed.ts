import {
  PrismaClient,
  EventArrangerRole,
  OrganizationRole,
  RegStatus,
  EventVisibility,
} from ".prisma/client";
import { categories } from "./dbProdData";
import { createUuidV5 } from "../src/util/uuid";
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
const MAPS_ORG_ID = "c997beea-620f-4b83-bb97-12f3c0b96a14";
const TEST_USER_ID = userIDs[0];
const NON_APPROVED_ORG_INDEX = 1;
const USER_ARRANGER_NAMESPACE = "4f9b1f61-cb0e-4b67-9627-2f65f0a0d9d7";
const ORGANIZATION_EVENT_INDEXES = new Set([1, 3, 5, 7, 8, 9]);

function getUserArrangerId(userId: string) {
  return createUuidV5(userId, USER_ARRANGER_NAMESPACE);
}

function getSeedEventArrangerId(index: number) {
  if (ORGANIZATION_EVENT_INDEXES.has(index)) {
    return arrangerIDs[index];
  }

  return getUserArrangerId(userIDs[index + 10]);
}

function getSeedEventTitle(index: number) {
  if (index === MAPS_INDEX) {
    return "MAPS testevent";
  }

  if (index === NON_APPROVED_ORG_INDEX) {
    return "Navet skjult testevent";
  }

  if (index === 3) {
    return "Ifi-Progsys org-event";
  }

  if (index === 5) {
    return "Digitus org-event";
  }

  if (index === 7) {
    return "Mikro org-event";
  }

  if (index === 9) {
    return "Toastjærn org-event";
  }

  if (index === 0) {
    return "Bruker-arrangert testevent";
  }

  return eventNames[index];
}

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
const MAPS_INDEX = ifiOrganizations.findIndex((org) => org.name === "MAPS");

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
    const eventArrangerId = getSeedEventArrangerId(i);

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
        id: getUserArrangerId(userIDs[i]),
      },
      update: {},
      create: {
        id: getUserArrangerId(userIDs[i]),
        isBusiness: false,
      },
    });
    await prisma.arranger.upsert({
      where: {
        id: getUserArrangerId(userIDs[i + 10]),
      },
      update: {},
      create: {
        id: getUserArrangerId(userIDs[i + 10]),
        isBusiness: false,
      },
    });
    await prisma.arranger.upsert({
      where: {
        id: getUserArrangerId(userIDs[i + 20]),
      },
      update: {},
      create: {
        id: getUserArrangerId(userIDs[i + 20]),
        isBusiness: false,
      },
    });

    await prisma.user.upsert({
      where: {
        id: userIDs[i],
      },
      update: {
        arrangerId: getUserArrangerId(userIDs[i]),
        phone: phoneNumbers[i],
        firstName: firstNames[i],
        lastName: lastNames[i],
        email: emails[i],
        birthDate: birthDates[i],
      },
      create: {
        id: userIDs[i],
        arrangerId: getUserArrangerId(userIDs[i]),
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
      update: {
        arrangerId: getUserArrangerId(userIDs[i + 10]),
        phone: phoneNumbers[i + 10],
        firstName: firstNames[i + 10],
        lastName: lastNames[i + 10],
        email: emails[i + 10],
        birthDate: birthDates[i],
      },
      create: {
        id: userIDs[i + 10],
        arrangerId: getUserArrangerId(userIDs[i + 10]),
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
      update: {
        arrangerId: getUserArrangerId(userIDs[i + 20]),
        phone: phoneNumbers[i + 20],
        firstName: firstNames[i + 20],
        lastName: lastNames[i + 20],
        email: emails[i + 20],
        birthDate: birthDates[i],
      },
      create: {
        id: userIDs[i + 20],
        arrangerId: getUserArrangerId(userIDs[i + 20]),
        phone: phoneNumbers[i + 20],
        firstName: firstNames[i + 20],
        lastName: lastNames[i + 20],
        email: emails[i + 20],
        birthDate: birthDates[i],
      },
    });

    if (i === MAPS_INDEX) {
      await prisma.organization.deleteMany({
        where: {
          arrangerId: arrangerIDs[i],
          id: {
            not: MAPS_ORG_ID,
          },
        },
      });
    }

    await prisma.organization.upsert({
      where: {
        id: i === MAPS_INDEX ? MAPS_ORG_ID : organisationIDs[i],
      },
      update: {
        name: ifiOrganizations[i].name,
        orgNr: ifiOrganizations[i].orgNr,
        approved: i !== NON_APPROVED_ORG_INDEX,
      },
      create: {
        id: i === MAPS_INDEX ? MAPS_ORG_ID : organisationIDs[i],
        arrangerId: arrangerIDs[i],
        name: ifiOrganizations[i].name,
        orgNr: ifiOrganizations[i].orgNr,
        approved: i !== NON_APPROVED_ORG_INDEX,
      },
    });

    let visibility: EventVisibility = EventVisibility.PUBLIC;
    if (!ORGANIZATION_EVENT_INDEXES.has(i) && i !== 0 && i % 2 === 0) {
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
        description: eventDescriptions[i],
        capacity: capacities[i],
        visibility,
        featured: i === 0,
        title: getSeedEventTitle(i),
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
        title: getSeedEventTitle(i),
        description: eventDescriptions[i],
        capacity: capacities[i],
        visibility,
        featured: i === 0,
        locationName: "Forskningsparken, Oslo",
        freeformAddress: "Gaustadalleen 21, 0349 Oslo",
      },
    });

    await prisma.eventArranger.deleteMany({
      where: {
        eventId: eventIDs[i],
      },
    });

    await prisma.eventArranger.create({
      data: {
        eventId: eventIDs[i],
        arrangerId: eventArrangerId,
        role: EventArrangerRole.ADMIN,
      },
    });

    await prisma.userOrganizationRole.upsert({
      where: {
        organizationId_userId: {
          organizationId: i === MAPS_INDEX ? MAPS_ORG_ID : organisationIDs[i],
          userId: userIDs[i],
        },
      },
      update: {},
      create: {
        organizationId: i === MAPS_INDEX ? MAPS_ORG_ID : organisationIDs[i],
        userId: userIDs[i],
        role: OrganizationRole.ADMIN,
      },
    });

    if (i === MAPS_INDEX) {
      await prisma.userOrganizationRole.upsert({
        where: {
          organizationId_userId: {
            organizationId: MAPS_ORG_ID,
            userId: TEST_USER_ID,
          },
        },
        update: {},
        create: {
          organizationId: MAPS_ORG_ID,
          userId: TEST_USER_ID,
          role: OrganizationRole.MEMBER,
        },
      });
    }

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
