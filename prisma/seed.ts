import {
  PrismaClient,
  event_arranger_roles,
  organization_roles,
  reg_status,
} from "@prisma/client";
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
  startDates,
  endDates,
  regDates,
  birthDates,
} from "./dbTestData";

const prisma = new PrismaClient();

async function main() {
  for (let i = 0; i < 10; i++) {
    const testArranger1 = await prisma.arrangers.upsert({
      where: {
        arranger_id: arrangerIDs[i],
      },
      update: {},
      create: {
        arranger_id: arrangerIDs[i],
        is_business: true,
      },
    });
    const testArranger2 = await prisma.arrangers.upsert({
      where: {
        arranger_id: arrangerIDs[i + 10],
      },
      update: {},
      create: {
        arranger_id: arrangerIDs[i + 10],
        is_business: false,
      },
    });
    const testArranger3 = await prisma.arrangers.upsert({
      where: {
        arranger_id: arrangerIDs[i + 20],
      },
      update: {},
      create: {
        arranger_id: arrangerIDs[i + 20],
        is_business: false,
      },
    });

    const testUser1 = await prisma.users.upsert({
      where: {
        user_id: userIDs[i],
      },
      update: {},
      create: {
        user_id: userIDs[i],
        arranger_id: arrangerIDs[i],
        phone: phoneNumbers[i],
        first_name: firstNames[i],
        last_name: lastNames[i],
        email: emails[i],
        birth_date: birthDates[i],
      },
    });

    const testUser2 = await prisma.users.upsert({
      where: {
        user_id: userIDs[i + 10],
      },
      update: {},
      create: {
        user_id: userIDs[i + 10],
        arranger_id: arrangerIDs[i + 10],
        phone: phoneNumbers[i + 10],
        first_name: firstNames[i + 10],
        last_name: lastNames[i + 10],
        email: emails[i + 10],
        birth_date: birthDates[i],
      },
    });

    const testUser3 = await prisma.users.upsert({
      where: {
        user_id: userIDs[i + 20],
      },
      update: {},
      create: {
        user_id: userIDs[i + 20],
        arranger_id: arrangerIDs[i + 20],
        phone: phoneNumbers[i + 20],
        first_name: firstNames[i + 20],
        last_name: lastNames[i + 20],
        email: emails[i + 20],
        birth_date: birthDates[i],
      },
    });

    const testOrganization = await prisma.organizations.upsert({
      where: {
        organization_id: organisationIDs[i],
      },
      update: {},
      create: {
        organization_id: organisationIDs[i],
        arranger_id: arrangerIDs[i],
        name: companyNames[i],
        org_nr: organisationNumbers[i],
      },
    });

    const testEvents = await prisma.events.upsert({
      where: {
        event_id: i + 1,
      },
      update: {},
      create: {
        start_date: startDates[i],
        end_date: endDates[i],
        title: eventNames[i],
        description: eventDescriptions[i],
        capacity: capacities[i],
        private: i % 2 === 0,
      },
    });

    const testEventArrangers = await prisma.event_arrangers.upsert({
      where: {
        event_id: i + 1,
      },
      update: {},
      create: {
        event_id: i + 1,
        arranger_id: arrangerIDs[i],
        role: event_arranger_roles.ADMIN,
      },
    });

    const testUserOrganizationRoles =
      await prisma.user_organization_roles.upsert({
        where: {
          organization_id_user_id: {
            organization_id: organisationIDs[i],
            user_id: userIDs[i],
          },
        },
        update: {},
        create: {
          organization_id: organisationIDs[i],
          user_id: userIDs[i],
          role: organization_roles.ADMIN,
        },
      });

    const testRegistrations1 = await prisma.registrations.upsert({
      where: {
        event_id_user_id: { event_id: i + 1, user_id: userIDs[i + 10] },
      },
      update: {},
      create: {
        event_id: i + 1,
        user_id: userIDs[i + 10],
        reg_date: regDates[i],
        reg_status: reg_status.COMPLETE,
        attendance: true,
      },
    });

    const testRegistrations2 = await prisma.registrations.upsert({
      where: {
        event_id_user_id: { event_id: i + 1, user_id: userIDs[i + 20] },
      },
      update: {},
      create: {
        event_id: i + 1,
        user_id: userIDs[i + 20],
        reg_date: regDates[i],
        reg_status: reg_status.PENDING,
        attendance: true,
      },
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
