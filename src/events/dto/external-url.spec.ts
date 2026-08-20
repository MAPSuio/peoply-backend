import { ValidationPipe } from "@nestjs/common";
import { CreateEventDto } from "./create-event.dto";
import { UpdateEventDto } from "./update-event.dto";

/**
 * The edit form submits every field on every save and writes "" for the ones
 * that are empty, so a PATCH of an event without external registration always
 * carries `externalUrl: ""`. `@IsOptional()` only skips undefined and null,
 * which made `@IsUrl` reject every such save with a 400.
 */
describe("event externalUrl", () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });

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

  it("accepts an empty string on update", async () => {
    await expect(parse(UpdateEventDto, { externalUrl: "" })).resolves.toEqual(
      expect.objectContaining({ externalUrl: "" }),
    );
  });

  it("accepts a real url on both", async () => {
    const url = "https://example.com/pameldning";

    await expect(parse(CreateEventDto, { externalUrl: url })).resolves.toEqual(
      expect.objectContaining({ externalUrl: url }),
    );
    await expect(parse(UpdateEventDto, { externalUrl: url })).resolves.toEqual(
      expect.objectContaining({ externalUrl: url }),
    );
  });

  /* The value is handed to window.open by JoinButton, so a non-http scheme
     here is stored XSS. Emptiness is the only thing being relaxed. */
  it.each(["javascript:alert(1)", "data:text/html,<script>", "ikke en url"])(
    "still rejects %s on update",
    async (value: string) => {
      await expect(
        parse(UpdateEventDto, { externalUrl: value }),
      ).rejects.toThrow();
    },
  );

  it("still rejects an empty string on create", async () => {
    await expect(parse(CreateEventDto, { externalUrl: "" })).rejects.toThrow();
  });

  it("may be omitted on both", async () => {
    await expect(parse(CreateEventDto, {})).resolves.not.toHaveProperty(
      "externalUrl",
    );
    await expect(parse(UpdateEventDto, {})).resolves.not.toHaveProperty(
      "externalUrl",
    );
  });
});
