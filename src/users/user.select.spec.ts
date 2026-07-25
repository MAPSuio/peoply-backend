import { EventArrangersService } from "../arrangers/services/eventArrangers.service";
import { EventInvitationsService } from "../invitations/services/eventInvitations.service";
import { FollowService } from "./services/follower.service";
import { PUBLIC_USER_SELECT } from "./user.select";

/**
 * Fields on `User` that must never be returned for someone other than the
 * requester. Listed explicitly rather than derived from the Prisma types so
 * that adding a sensitive column to the schema does not silently widen what
 * this file considers safe.
 */
const SENSITIVE_USER_FIELDS = [
  "email",
  "phone",
  "birthDate",
  "foodPreference",
  "allowEmailPromotions",
  "allowEmailFromArranger",
  "allowEmailOnWaitlist",
  "refreshTokenId",
];

describe("PUBLIC_USER_SELECT", () => {
  it("is a whitelist, not a blacklist", () => {
    // Asserting the exact key set is the point: a select that merely happens
    // to omit today's sensitive fields would still leak tomorrow's.
    expect(Object.keys(PUBLIC_USER_SELECT).sort()).toEqual([
      "firstName",
      "id",
      "image",
      "lastName",
    ]);
  });

  it.each(SENSITIVE_USER_FIELDS)("does not expose %s", (field) => {
    expect(PUBLIC_USER_SELECT).not.toHaveProperty(field);
  });
});

/**
 * Walks a Prisma query argument tree and collects every relation include that
 * resolves to a `User`, by the name it is exposed under.
 */
const collectUserIncludes = (node: any, found: any[] = []): any[] => {
  if (!node || typeof node !== "object") {
    return found;
  }

  for (const [key, value] of Object.entries(node)) {
    if (key === "user" || key === "fromUser" || key === "toUser") {
      found.push(value);
    }
    collectUserIncludes(value, found);
  }

  return found;
};

describe("endpoints that return other people's users", () => {
  // Each entry calls one service method and hands back every query Prisma was
  // asked to run. These three shared one defect — `user: true` — on three
  // separate routes, so they are checked by one invariant rather than three
  // hand-written assertions that can drift apart.
  const cases: Array<[string, () => Promise<any[]>]> = [
    [
      "FollowService.findAll (GET /users/:userId/following)",
      async () => {
        const calls: any[] = [];
        const prisma: any = {
          arrangerFollower: {
            findMany: jest.fn((args) => {
              calls.push(args);
              return Promise.resolve([]);
            }),
          },
        };

        await new FollowService(prisma).findAll("user-1");
        return calls;
      },
    ],
    [
      "EventArrangersService.findAllWithEventsArrangedByUserAndOrganizationsOfUser (GET /users/:userId/arranging)",
      async () => {
        const calls: any[] = [];
        const prisma: any = {
          organization: { findMany: jest.fn().mockResolvedValue([]) },
          user: {
            findUnique: jest
              .fn()
              .mockResolvedValue({ id: "user-1", arrangerId: "arr-1" }),
          },
          eventArranger: {
            findMany: jest.fn((args) => {
              calls.push(args);
              return Promise.resolve([]);
            }),
          },
        };

        await new EventArrangersService(
          prisma,
        ).findAllWithEventsArrangedByUserAndOrganizationsOfUser("user-1");
        return calls;
      },
    ],
    [
      "EventInvitationsService.findAllPendingInvitationsToUser (GET /users/:userId/notifications)",
      async () => {
        const calls: any[] = [];
        const prisma: any = {
          eventInvitation: {
            findMany: jest.fn((args) => {
              calls.push(args);
              return Promise.resolve([]);
            }),
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          },
        };

        await new EventInvitationsService(
          prisma,
          {} as any,
        ).findAllPendingInvitationsToUser("user-1");
        return calls;
      },
    ],
    [
      "EventInvitationsService.findAllInvitationsForEventIncludingUsers (GET /events/:eventId/invitations)",
      async () => {
        const calls: any[] = [];
        const prisma: any = {
          event: { findUnique: jest.fn().mockResolvedValue({ endDate: null }) },
          eventInvitation: {
            findMany: jest.fn((args) => {
              calls.push(args);
              return Promise.resolve([]);
            }),
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          },
        };

        await new EventInvitationsService(
          prisma,
          {} as any,
        ).findAllInvitationsForEventIncludingUsers("event-1");
        return calls;
      },
    ],
  ];

  it.each(cases)("%s never includes a whole user row", async (_name, run) => {
    const queries = await run();
    expect(queries.length).toBeGreaterThan(0);

    const userIncludes: any[] = [];
    for (const query of queries) {
      collectUserIncludes(query, userIncludes);
    }

    for (const include of userIncludes) {
      // `true` is the whole row. Anything kept has to name its fields.
      expect(include).not.toBe(true);
      expect(include).toHaveProperty("select");
      expect(include.select).toEqual(PUBLIC_USER_SELECT);
    }
  });
});
