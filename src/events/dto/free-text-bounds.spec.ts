import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { CreateEventDto } from "./create-event.dto";
import { UpdateEventDto } from "./update-event.dto";
import { SearchEventDto } from "./search-event.dto";
import { UpdateOrganizationDto } from "../../organizations/dto/update-organization.dto";
import { SearchOrganizationDto } from "../../organizations/dto/search-organization.dto";

const hasError = async (dto: object, property: string) =>
  (await validate(dto)).some((error) => error.property === property);

const baseCreateEvent = {
  title: "A valid title",
  description: "short",
  visibility: "PUBLIC",
  arrangerId: "11111111-1111-1111-1111-111111111111",
  startDate: "2026-04-01T18:00:00.000Z",
  endDate: "2026-04-01T22:00:00.000Z",
  categoryIds: [1],
};

describe("free-text field bounds", () => {
  it("rejects an over-long event description on create", async () => {
    const dto = plainToInstance(CreateEventDto, {
      ...baseCreateEvent,
      description: "x".repeat(10001),
    });
    expect(await hasError(dto, "description")).toBe(true);
  });

  it("rejects an over-long event description on update", async () => {
    const dto = plainToInstance(UpdateEventDto, {
      title: "A valid title",
      description: "x".repeat(10001),
    });
    expect(await hasError(dto, "description")).toBe(true);
  });

  it("rejects an over-long organization description on update", async () => {
    const dto = plainToInstance(UpdateOrganizationDto, {
      description: "x".repeat(301),
    });
    expect(await hasError(dto, "description")).toBe(true);
  });

  it("rejects an over-long event search term", async () => {
    const dto = plainToInstance(SearchEventDto, {
      description: "x".repeat(201),
    });
    expect(await hasError(dto, "description")).toBe(true);
  });

  it("rejects an over-long organization search term", async () => {
    const dto = plainToInstance(SearchOrganizationDto, {
      name: "x".repeat(201),
    });
    expect(await hasError(dto, "name")).toBe(true);
  });

  it("accepts a normal event description", async () => {
    const dto = plainToInstance(CreateEventDto, baseCreateEvent);
    expect(await hasError(dto, "description")).toBe(false);
  });
});
