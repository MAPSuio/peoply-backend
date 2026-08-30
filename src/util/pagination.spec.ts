import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { SearchEventDto } from "../events/dto/search-event.dto";
import { SearchEventRegistrationDto } from "../events/dto/search-event-registration.dto";
import { SearchFavoritesDto } from "../favorites/dto/search-favorites.dto";
import { SearchOrganizationDto } from "../organizations/dto/search-organization.dto";
import { SearchUserRegistrationDto } from "../registrations/dto/search-user-registration.dto";
import { SearchUserDto } from "../users/dto/search-user.dto";
import { MAX_PAGE_SIZE } from "./pagination";

const searchDtos = [
  ["SearchEventDto", SearchEventDto],
  ["SearchEventRegistrationDto", SearchEventRegistrationDto],
  ["SearchFavoritesDto", SearchFavoritesDto],
  ["SearchOrganizationDto", SearchOrganizationDto],
  ["SearchUserRegistrationDto", SearchUserRegistrationDto],
  ["SearchUserDto", SearchUserDto],
] as const;

/* The DTOs that let the caller pick a sort column, each with a column that is
   a scalar on its model and a name that is a relation on it — the exact shape
   that made Prisma 500 when orderBy validation was a per-service dummy object
   (and the favorites copy had drifted onto the wrong model). */
const pagedQueryDtos = [
  ["SearchEventDto", SearchEventDto, "startDate", "eventArrangers"],
  [
    "SearchEventRegistrationDto",
    SearchEventRegistrationDto,
    "regStatus",
    "user",
  ],
  ["SearchFavoritesDto", SearchFavoritesDto, "createdAt", "event"],
  [
    "SearchUserRegistrationDto",
    SearchUserRegistrationDto,
    "regStatus",
    "event",
  ],
] as const;

// Query params arrive as strings, so mirror what the global ValidationPipe
// ({ transform: true }) hands to class-validator.
const validateTake = (dto: any, take: string) =>
  validateSync(plainToInstance(dto, { take }));

const validateSkip = (dto: any, skip: string) =>
  validateSync(plainToInstance(dto, { skip }));

describe.each(searchDtos)("%s take bounds", (_name, dto) => {
  it(`rejects take above MAX_PAGE_SIZE (${MAX_PAGE_SIZE})`, () => {
    const errors = validateTake(dto, String(MAX_PAGE_SIZE + 1));

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe("take");
    expect(errors[0].constraints).toHaveProperty("max");
  });

  it("rejects a grossly oversized take", () => {
    const errors = validateTake(dto, "999999");

    expect(errors).toHaveLength(1);
    expect(errors[0].constraints).toHaveProperty("max");
  });

  it(`accepts take exactly at MAX_PAGE_SIZE (${MAX_PAGE_SIZE})`, () => {
    expect(validateTake(dto, String(MAX_PAGE_SIZE))).toHaveLength(0);
  });

  it("accepts the service default of 10", () => {
    expect(validateTake(dto, "10")).toHaveLength(0);
  });

  // The web frontend sends take=500 from the events index and several other
  // pages. Capping below this returned 400 and broke those pages outright,
  // so pin the value here rather than only testing the abstract bound.
  it("accepts take=500, which the web frontend sends today", () => {
    expect(validateTake(dto, "500")).toHaveLength(0);
  });

  it("allows take to be omitted", () => {
    expect(validateSync(plainToInstance(dto, {}))).toHaveLength(0);
  });

  it("accepts the smallest useful page, take=1", () => {
    expect(validateTake(dto, "1")).toHaveLength(0);
  });

  // Not because take=0 is a useful request, but because the lower bound has to
  // be the same on all five. Four of them already allowed it, so raising them
  // to match the fifth would have broken clients rather than unbroken one.
  it("accepts take=0", () => {
    expect(validateTake(dto, "0")).toHaveLength(0);
  });

  it("rejects a negative take", () => {
    const errors = validateTake(dto, "-1");

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe("take");
    expect(errors[0].constraints).toHaveProperty("min");
  });
});

// `skip` is an offset, so 0 is the first page and every paginating client sends
// it. These run across all the search DTOs because the bug they cover was one
// DTO drifting from the others rather than a rule being wrong everywhere.
describe.each(searchDtos)("%s skip bounds", (_name, dto) => {
  it("accepts skip=0, the first page", () => {
    expect(validateSkip(dto, "0")).toHaveLength(0);
  });

  it("accepts a skip past the first page", () => {
    expect(validateSkip(dto, "20")).toHaveLength(0);
  });

  it("rejects a negative skip", () => {
    const errors = validateSkip(dto, "-1");

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe("skip");
    expect(errors[0].constraints).toHaveProperty("min");
  });

  it("allows skip to be omitted", () => {
    expect(validateSync(plainToInstance(dto, {}))).toHaveLength(0);
  });
});

describe.each(pagedQueryDtos)(
  "%s orderBy",
  (_name, dto, scalarColumn, relationName) => {
    const validate = (query: Record<string, string>) =>
      validateSync(plainToInstance(dto, query));

    it(`accepts the model's own column "${scalarColumn}"`, () => {
      expect(validate({ orderBy: scalarColumn })).toHaveLength(0);
    });

    it("accepts updatedAt, the service default", () => {
      expect(validate({ orderBy: "updatedAt" })).toHaveLength(0);
    });

    it(`rejects the relation "${relationName}"`, () => {
      const errors = validate({ orderBy: relationName });

      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe("orderBy");
      expect(errors[0].constraints).toHaveProperty("isIn");
    });

    it("rejects a name that is no column at all", () => {
      const errors = validate({ orderBy: "definitelyNotAColumn" });

      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe("orderBy");
    });

    it("allows orderBy to be omitted", () => {
      expect(validate({})).toHaveLength(0);
    });

    it("accepts orderDirection asc and desc", () => {
      expect(validate({ orderDirection: "asc" })).toHaveLength(0);
      expect(validate({ orderDirection: "desc" })).toHaveLength(0);
    });

    it("rejects any other orderDirection", () => {
      const errors = validate({ orderDirection: "sideways" });

      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe("orderDirection");
    });
  },
);

describe("SearchFavoritesDto eventId validation", () => {
  it("rejects a malformed eventId", () => {
    const errors = validateSync(
      plainToInstance(SearchFavoritesDto, { eventId: "not-a-uuid" }),
    );

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe("eventId");
    expect(errors[0].constraints).toHaveProperty("isUuid");
  });

  it("accepts a valid UUID eventId", () => {
    const errors = validateSync(
      plainToInstance(SearchFavoritesDto, {
        eventId: "2d2bfaad-3eb9-4f1b-8657-c0263eeacc5b",
      }),
    );

    expect(errors).toHaveLength(0);
  });
});
