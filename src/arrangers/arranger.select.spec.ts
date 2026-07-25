import { EventsService } from "../events/events.service";
import { PUBLIC_USER_SELECT } from "../users/user.select";
import { PUBLIC_ARRANGER_INCLUDE } from "./arranger.select";
import { EventArrangersService } from "./services/eventArrangers.service";

/**
 * The literal that used to sit inline at all three call sites below, copied
 * here verbatim. Extracting a constant is only safe if it changes nothing, and
 * `tsc` will not catch a dropped or added field — `Prisma.validator` checks
 * that the field *names* exist, not that the *set* is the one we had. So the
 * old shape is written out once, by hand, and every call site is asserted
 * against it.
 */
const SHAPE_BEFORE_EXTRACTION = {
  user: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      image: true,
    },
  },
  organization: {
    select: {
      id: true,
      urlId: true,
      name: true,
      image: true,
      orgNr: true,
    },
  },
};

describe("PUBLIC_ARRANGER_INCLUDE", () => {
  it("is byte-for-byte what the three call sites had inline", () => {
    expect(PUBLIC_ARRANGER_INCLUDE).toEqual(SHAPE_BEFORE_EXTRACTION);
  });

  it("routes user through the shared boundary rather than its own copy", () => {
    // If someone later edits the literal above instead of PUBLIC_USER_SELECT,
    // this is what notices.
    expect(PUBLIC_ARRANGER_INCLUDE.user).toEqual({
      select: PUBLIC_USER_SELECT,
    });
  });
});

/** Pulls every `arranger` include out of a Prisma query argument tree. */
const collectArrangerIncludes = (node: any, found: any[] = []): any[] => {
  if (!node || typeof node !== "object") {
    return found;
  }

  for (const [key, value] of Object.entries(node)) {
    if (key === "arranger" && (value as any)?.include) {
      found.push((value as any).include);
    }
    collectArrangerIncludes(value, found);
  }

  return found;
};

describe("public endpoints still ask Prisma for the same arranger", () => {
  const cases: Array<[string, () => Promise<any[]>]> = [
    [
      "EventsService.findAll (GET /events)",
      async () => {
        const calls: any[] = [];
        const prisma: any = {
          event: {
            findMany: jest.fn((args) => {
              calls.push(args);
              return Promise.resolve([]);
            }),
          },
        };

        await new EventsService(
          prisma,
          {} as any,
          {} as any,
          {} as any,
        ).findAll();
        return calls;
      },
    ],
    [
      "EventsService.findOneByUrlId (GET /events/:urlId)",
      async () => {
        const calls: any[] = [];
        const prisma: any = {
          event: {
            findUnique: jest.fn((args) => {
              calls.push(args);
              // A row has to come back: the method throws on a miss, and we
              // are here for the query it sent, not the row it returns.
              return Promise.resolve({ id: "event-1", archivedAt: null });
            }),
          },
        };

        await new EventsService(
          prisma,
          {} as any,
          {} as any,
          {} as any,
        ).findOneByUrlId("some-event");
        return calls;
      },
    ],
    [
      "EventArrangersService.findAllPublicWithEvents (GET /arrangers/:arrangerId/events)",
      async () => {
        const calls: any[] = [];
        const prisma: any = {
          eventArranger: {
            findMany: jest.fn((args) => {
              calls.push(args);
              return Promise.resolve([]);
            }),
          },
        };

        await new EventArrangersService(prisma).findAllPublicWithEvents(
          "arr-1",
        );
        return calls;
      },
    ],
  ];

  it.each(cases)("%s", async (_name, run) => {
    const queries = await run();
    expect(queries.length).toBeGreaterThan(0);

    const includes: any[] = [];
    for (const query of queries) {
      collectArrangerIncludes(query, includes);
    }

    expect(includes.length).toBeGreaterThan(0);
    for (const include of includes) {
      expect(include).toEqual(SHAPE_BEFORE_EXTRACTION);
    }
  });
});
