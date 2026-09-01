import { getMetadataStorage } from "class-validator";
import {
  MULTIPART_FIELD_HEADROOM,
  type UploadDto,
  imageUploadOptionsFor,
} from "./image-upload";
import { CreateEventDto } from "../events/dto/create-event.dto";
import { UpdateEventDto } from "../events/dto/update-event.dto";
import { UpdateUserDto } from "../users/dto";
import { UpdateOrganizationDto } from "../organizations/dto/update-organization.dto";

function acceptedFieldNames(dto: UploadDto): string[] {
  const names = new Set<string>();

  for (const metadata of getMetadataStorage().getTargetValidationMetadatas(
    dto,
    "",
    true,
    false,
  )) {
    names.add(metadata.propertyName);
  }

  return [...names];
}

const UPLOAD_ROUTES = [
  { route: "POST /events", dto: CreateEventDto },
  { route: "PATCH /events/:id", dto: UpdateEventDto },
  { route: "PATCH /users/me", dto: UpdateUserDto },
  { route: "PATCH /organizations/:orgId", dto: UpdateOrganizationDto },
];

describe("imageUploadOptionsFor", () => {
  it.each(UPLOAD_ROUTES)(
    "lets $route send every field its own DTO accepts",
    ({ dto }) => {
      const limits = imageUploadOptionsFor(dto).limits;

      expect(limits?.fields).toBeGreaterThanOrEqual(
        acceptedFieldNames(dto).length,
      );
    },
  );

  it.each(UPLOAD_ROUTES)(
    "counts the file part on top of the fields for $route",
    ({ dto }) => {
      const limits = imageUploadOptionsFor(dto).limits;

      expect(limits?.parts).toBeGreaterThanOrEqual(
        (limits?.fields ?? 0) + (limits?.files ?? 0),
      );
    },
  );

  /* The event edit form writes every property of its own state, including the
     empty ones, so a limit derived from anything smaller than the DTO takes
     the whole form down. A hand-picked 16 against 29 accepted fields is what
     made every save answer 400. */
  it("admits the whole event edit form, which sends all 29 fields at once", () => {
    expect(acceptedFieldNames(UpdateEventDto)).toHaveLength(29);
    expect(
      imageUploadOptionsFor(UpdateEventDto).limits?.fields,
    ).toBeGreaterThan(29);
  });

  it("still bounds the flood a field limit exists to stop", () => {
    const limits = imageUploadOptionsFor(UpdateEventDto).limits;
    const acceptedFields = acceptedFieldNames(UpdateEventDto).length;

    expect(limits?.fields).toBe(acceptedFields + MULTIPART_FIELD_HEADROOM);
    expect(limits?.fieldSize).toBe(64 * 1024);
  });

  it("keeps the file rules identical across routes", () => {
    for (const { dto } of UPLOAD_ROUTES) {
      const options = imageUploadOptionsFor(dto);

      expect(options.limits?.files).toBe(1);
      expect(options.fileFilter).toBeDefined();
    }
  });
});
