import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { type UploadDto, imageUploadOptionsFor } from "../azure/image-upload";
import { CreateEventDto } from "../events/dto/create-event.dto";
import { UpdateEventDto } from "../events/dto/update-event.dto";
import { CreateOrganizationDto } from "../organizations/dto/create-organization.dto";
import { UpdateOrganizationDto } from "../organizations/dto/update-organization.dto";

const LONGEST_WE_EVER_SEARCH_FOR = 100_000;
const URL_PREFIX = "https://a.example/";

/**
 * A value of exactly `length` characters that is otherwise valid for the
 * field, so the only thing the validator can object to is the length.
 */
function valueOfLength(field: string, length: number): string {
  if (!field.toLowerCase().endsWith("url")) {
    return "a".repeat(length);
  }

  return length <= URL_PREFIX.length
    ? URL_PREFIX.slice(0, length)
    : URL_PREFIX + "a".repeat(length - URL_PREFIX.length);
}

async function accepts(
  dto: UploadDto,
  field: string,
  length: number,
): Promise<boolean> {
  const candidate = plainToInstance(dto, {
    [field]: valueOfLength(field, length),
  });
  const errors = await validate(candidate as object, {
    skipMissingProperties: true,
  });

  return !errors.some((error) => error.property === field);
}

async function shortestAccepted(
  dto: UploadDto,
  field: string,
): Promise<number | undefined> {
  for (let length = 1; length <= 64; length += 1) {
    if (await accepts(dto, field, length)) {
      return length;
    }
  }

  return undefined;
}

/**
 * The longest string this DTO accepts for a field, found by asking it rather
 * than by reading a number out of the source. A cap written as a literal is
 * exactly what this file exists to catch.
 */
async function longestAccepted(dto: UploadDto, field: string): Promise<number> {
  let accepted = await shortestAccepted(dto, field);

  if (accepted === undefined) {
    throw new Error(`${field} rejects every value this test can build`);
  }

  if (await accepts(dto, field, LONGEST_WE_EVER_SEARCH_FOR)) {
    return LONGEST_WE_EVER_SEARCH_FOR;
  }

  let rejected = LONGEST_WE_EVER_SEARCH_FOR;

  while (rejected - accepted > 1) {
    const middle = Math.floor((accepted + rejected) / 2);

    if (await accepts(dto, field, middle)) {
      accepted = middle;
    } else {
      rejected = middle;
    }
  }

  return accepted;
}

const TEXT_FIELDS_BY_PAIR = [
  {
    name: "event",
    create: CreateEventDto,
    update: UpdateEventDto,
    fields: ["title", "description", "formQuestion", "externalUrl"],
  },
  {
    name: "organization",
    create: CreateOrganizationDto,
    update: UpdateOrganizationDto,
    fields: ["name", "description"],
  },
];

const UPLOAD_DTOS: Array<{ name: string; dto: UploadDto; fields: string[] }> =
  TEXT_FIELDS_BY_PAIR.flatMap((pair) => [
    { name: `Create${pair.name}`, dto: pair.create, fields: pair.fields },
    { name: `Update${pair.name}`, dto: pair.update, fields: pair.fields },
  ]);

describe("a row the create route accepts stays editable", () => {
  /* A cap that is tighter on update than on create locks the owner out of
     their own row: it was saved at the create limit and can never be saved
     again. UpdateOrganizationDto had already lost the inherited cap on
     description once. */
  for (const pair of TEXT_FIELDS_BY_PAIR) {
    for (const field of pair.fields) {
      it(`lets ${pair.name}.${field} be saved at the length creation allowed`, async () => {
        const atCreate = await longestAccepted(pair.create, field);
        const atUpdate = await longestAccepted(pair.update, field);

        expect(atCreate).toBeGreaterThan(0);
        expect(atUpdate).toBeGreaterThanOrEqual(atCreate);
      });
    }
  }
});

describe("a maximal payload fits through the multipart transport", () => {
  /* multer counts bytes per field before validation runs, so a text cap above
     what one part may carry is rejected by the transport with a 400 that no
     validator ever explains. Four bytes per character is the UTF-8 worst case
     an emoji hits. */
  for (const { name, dto, fields } of UPLOAD_DTOS) {
    for (const field of fields) {
      it(`carries ${name}.${field} at its longest accepted value`, async () => {
        const longest = await longestAccepted(dto, field);
        const fieldSize = imageUploadOptionsFor(dto).limits?.fieldSize ?? 0;

        expect(longest * 4).toBeLessThanOrEqual(fieldSize);
      });
    }
  }
});
