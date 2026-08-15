import { ValidationPipe } from "@nestjs/common";
import { CreateEventDto } from "./create-event.dto";
import { UpdateEventDto } from "./update-event.dto";

/**
 * The address fields are declared through shared decorators, and the whole
 * point of there being two of them is that create and update treat an empty
 * string differently: on update it clears the field, on create it does not.
 * These tests are what keeps that difference from quietly collapsing.
 */
describe("event address fields", () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });

  /* CreateEventDto has required fields of its own, and a payload without them
     never reaches the address rules. UpdateEventDto is a PartialType, so the
     same object validates there too. */
  const REQUIRED = {
    startDate: "2030-01-01T18:00:00.000Z",
    title: "Et arrangement",
    description: "En beskrivelse",
    visibility: "PUBLIC",
    hasFood: false,
    locationName: "Kjelleren",
    categoryIds: [1],
  };

  const parse = (metatype: any, value: Record<string, unknown>) =>
    pipe.transform({ ...REQUIRED, ...value }, { type: "body", metatype });

  const TEXT_FIELDS = [
    "poiName",
    "country",
    "countryCode",
    "countryCodeISO3",
    "countrySubdivision",
    "localName",
    "municipality",
    "postalCode",
    "streetName",
    "streetNumber",
    "freeformAddress",
  ];

  describe.each(TEXT_FIELDS)("%s", (field) => {
    it("passes a real value through on both", async () => {
      await expect(parse(CreateEventDto, { [field]: "Oslo" })).resolves.toEqual(
        expect.objectContaining({ [field]: "Oslo" }),
      );
      await expect(parse(UpdateEventDto, { [field]: "Oslo" })).resolves.toEqual(
        expect.objectContaining({ [field]: "Oslo" }),
      );
    });

    it("keeps an empty string on create", async () => {
      await expect(parse(CreateEventDto, { [field]: "" })).resolves.toEqual(
        expect.objectContaining({ [field]: "" }),
      );
    });

    // "" is how the client says "remove what is there".
    it("turns an empty string into null on update", async () => {
      await expect(parse(UpdateEventDto, { [field]: "" })).resolves.toEqual(
        expect.objectContaining({ [field]: null }),
      );
    });

    it("may be omitted on both", async () => {
      await expect(parse(CreateEventDto, {})).resolves.not.toHaveProperty(
        field,
      );
      await expect(parse(UpdateEventDto, {})).resolves.not.toHaveProperty(
        field,
      );
    });
  });

  describe.each(["latitude", "longitude"])("%s", (field) => {
    it("parses a numeric string on both", async () => {
      await expect(
        parse(CreateEventDto, { [field]: "59.91" }),
      ).resolves.toEqual(expect.objectContaining({ [field]: 59.91 }));
      await expect(
        parse(UpdateEventDto, { [field]: "59.91" }),
      ).resolves.toEqual(expect.objectContaining({ [field]: 59.91 }));
    });

    /* `new Number(null).valueOf()` is 0, so a cleared coordinate used to come
       out as a real point off the coast of Ghana. */
    it("turns an empty string into null on update", async () => {
      await expect(parse(UpdateEventDto, { [field]: "" })).resolves.toEqual(
        expect.objectContaining({ [field]: null }),
      );
    });

    it("rejects something that is not a number", async () => {
      await expect(
        parse(CreateEventDto, { [field]: "ikke et tall" }),
      ).rejects.toThrow();
    });
  });
});
