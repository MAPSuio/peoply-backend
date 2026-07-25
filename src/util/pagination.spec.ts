import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { SearchEventDto } from "../events/dto/search-event.dto";
import { SearchEventRegistrationDto } from "../events/dto/search-event-registration.dto";
import { SearchOrganizationDto } from "../organizations/dto/search-organization.dto";
import { SearchUserRegistrationDto } from "../registrations/dto/search-user-registration.dto";
import { SearchUserDto } from "../users/dto/search-user.dto";
import { MAX_PAGE_SIZE } from "./pagination";

const searchDtos = [
  ["SearchEventDto", SearchEventDto],
  ["SearchEventRegistrationDto", SearchEventRegistrationDto],
  ["SearchOrganizationDto", SearchOrganizationDto],
  ["SearchUserRegistrationDto", SearchUserRegistrationDto],
  ["SearchUserDto", SearchUserDto],
] as const;

// Query params arrive as strings, so mirror what the global ValidationPipe
// ({ transform: true }) hands to class-validator.
const validateTake = (dto: any, take: string) =>
  validateSync(plainToInstance(dto, { take }));

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
});
