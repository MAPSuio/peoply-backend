import { ValidationPipe } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateOrganizationDto } from "./create-organization.dto";
import { UpdateOrganizationDto } from "./update-organization.dto";

/**
 * `Organization.image` is the blob name the logo is stored under, and
 * `OrganizationsService.update` deletes `org.image` from the shared
 * organization-images container without checking who owns that blob. While the
 * field was writable, any authenticated user could create their own
 * organization, point its `image` at another organization's logo, ask to remove
 * their own image, and delete someone else's.
 */
describe("organization DTOs and the image field", () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });

  const strip = async (metatype: any, body: object) =>
    (await pipe.transform(body, { type: "body", metatype })) as Record<
      string,
      unknown
    >;

  const victimBlob =
    "https://peoplyprod.blob.core.windows.net/organization-images/victim-org-abc123.png";

  it("strips image from a create body", async () => {
    const result = await strip(CreateOrganizationDto, {
      name: "Acme",
      image: victimBlob,
    });

    expect(result.image).toBeUndefined();
    expect(result.name).toBe("Acme");
  });

  it("strips image from an update body", async () => {
    const result = await strip(UpdateOrganizationDto, { image: victimBlob });

    expect(result.image).toBeUndefined();
  });
});

describe("CreateOrganizationDto.name", () => {
  const errorsFor = async (dto: object) =>
    validate(plainToInstance(CreateOrganizationDto, dto));

  it("accepts a normal name", async () => {
    expect(await errorsFor({ name: "Digitus" })).toHaveLength(0);
  });

  /* Unbounded, this reached the Discord embed that alerts moderators. Discord
     400s a field value over 1024 characters and reportOrganization only logs
     it, so a long enough name made the organization unreportable. */
  it("rejects a name long enough to break the moderator alert", async () => {
    expect(
      (await errorsFor({ name: "a".repeat(2000) })).length,
    ).toBeGreaterThan(0);
  });

  it("still rejects an empty name", async () => {
    expect((await errorsFor({ name: "" })).length).toBeGreaterThan(0);
  });
});
