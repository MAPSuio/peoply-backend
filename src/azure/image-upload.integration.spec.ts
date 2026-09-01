import {
  Body,
  Controller,
  INestApplication,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { getMetadataStorage } from "class-validator";
import request from "supertest";
import { MAX_FIELD_BYTES, imageUploadOptionsFor } from "./image-upload";
import { CreateEventDto } from "../events/dto/create-event.dto";
import { UpdateEventDto } from "../events/dto/update-event.dto";
import { UpdateUserDto } from "../users/dto";
import { UpdateOrganizationDto } from "../organizations/dto/update-organization.dto";

type UploadDto = new (...args: never[]) => object;

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

@Controller("uploads")
class UploadProbeController {
  @Post("event")
  @UseInterceptors(
    FileInterceptor("eventImage", imageUploadOptionsFor(CreateEventDto)),
  )
  createEvent(
    @Body() body: unknown,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return { fields: Object.keys(body as object).length, file: Boolean(file) };
  }

  @Patch("event")
  @UseInterceptors(
    FileInterceptor("eventImage", imageUploadOptionsFor(UpdateEventDto)),
  )
  updateEvent(
    @Body() body: unknown,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return { fields: Object.keys(body as object).length, file: Boolean(file) };
  }

  @Patch("user")
  @UseInterceptors(
    FileInterceptor("profileImage", imageUploadOptionsFor(UpdateUserDto)),
  )
  updateUser(@Body() body: unknown) {
    return { fields: Object.keys(body as object).length };
  }

  @Patch("organization")
  @UseInterceptors(
    FileInterceptor("orgImage", imageUploadOptionsFor(UpdateOrganizationDto)),
  )
  updateOrganization(@Body() body: unknown) {
    return { fields: Object.keys(body as object).length };
  }
}

const ROUTES = [
  {
    path: "/uploads/event",
    method: "post" as const,
    dto: CreateEventDto,
    filePart: "eventImage",
  },
  {
    path: "/uploads/event",
    method: "patch" as const,
    dto: UpdateEventDto,
    filePart: "eventImage",
  },
  {
    path: "/uploads/user",
    method: "patch" as const,
    dto: UpdateUserDto,
    filePart: "profileImage",
  },
  {
    path: "/uploads/organization",
    method: "patch" as const,
    dto: UpdateOrganizationDto,
    filePart: "orgImage",
  },
];

const onePixelPng = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489",
  "hex",
);

describe("multipart limits against the form the route accepts", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [UploadProbeController],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each(ROUTES)(
    "accepts every field of its own DTO on $method $path",
    async ({ path, method, dto }) => {
      const fields = acceptedFieldNames(dto);
      let pending = request(app.getHttpServer())[method](path);

      for (const field of fields) {
        pending = pending.field(field, "");
      }

      const response = await pending;

      expect(response.status).toBe(201 - (method === "patch" ? 1 : 0));
      expect(response.body.fields).toBe(fields.length);
    },
  );

  it.each(ROUTES)(
    "accepts the whole form plus its image on $method $path",
    async ({ path, method, dto, filePart }) => {
      const fields = acceptedFieldNames(dto);
      let pending = request(app.getHttpServer())[method](path);

      for (const field of fields) {
        pending = pending.field(field, "");
      }

      const response = await pending.attach(filePart, onePixelPng, {
        filename: "probe.png",
        contentType: "image/png",
      });

      expect(response.status).toBe(201 - (method === "patch" ? 1 : 0));
    },
  );

  /* `fieldSize` bounds one text part, and the longest one the DTOs accept is
     the 10 000-character event description. Emoji make that 40 kB, so the two
     caps have to be read together or a long description 400s on save. */
  it("carries the longest description the DTO accepts, even in four-byte characters", async () => {
    const longestAcceptedDescription = "\u{1F600}".repeat(10_000);

    expect(Buffer.byteLength(longestAcceptedDescription)).toBeLessThan(
      MAX_FIELD_BYTES,
    );

    const response = await request(app.getHttpServer())
      .patch("/uploads/event")
      .field("description", longestAcceptedDescription);

    expect(response.status).toBe(200);
  });

  it("still refuses a field flood well past the contract", async () => {
    const tooMany = acceptedFieldNames(UpdateEventDto).length + 200;
    let pending = request(app.getHttpServer()).patch("/uploads/event");

    for (let index = 0; index < tooMany; index += 1) {
      pending = pending.field(`filler${index}`, "x");
    }

    const response = await pending;

    expect(response.status).toBe(400);
  });
});
