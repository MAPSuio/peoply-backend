import { ValidationPipe } from "@nestjs/common";
import { UpdateEventDto } from "../events/dto/update-event.dto";
import { UpdateInvitationDto } from "../invitations/dto/update-invitation.dto";
import { CreateRegistrationDto } from "./dto/create-registration.dto";
import { UserUpdateRegistrationDto } from "./dto/user-update-registration.dto";
import { MAX_FORM_ANSWER_LENGTH } from "./registration.constants";

/* Two values the services assume are already sane by the time they see them. */
describe("registration and event DTO bounds", () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });
  const parse = (metatype: any, value: Record<string, unknown>) =>
    pipe.transform(value, { type: "body", metatype });

  describe("formAnswer is bounded on every write path", () => {
    const cases: Array<[string, any, Record<string, unknown>]> = [
      [
        "POST /users/:id/registrations",
        CreateRegistrationDto,
        { eventId: "3f1e9d4c-8b2a-4c6e-9f0d-7a5b3c1e2d4f", regStatus: "GOING" },
      ],
      [
        "PATCH /users/:id/registrations",
        UserUpdateRegistrationDto,
        { eventId: "3f1e9d4c-8b2a-4c6e-9f0d-7a5b3c1e2d4f", regStatus: "GOING" },
      ],
      [
        "PATCH /events/:id/invitations",
        UpdateInvitationDto,
        { status: "ACCEPTED" },
      ],
    ];

    it.each(cases)(
      "rejects an oversized answer on %s",
      async (_n, dto, base) => {
        await expect(
          parse(dto, {
            ...base,
            formAnswer: "a".repeat(MAX_FORM_ANSWER_LENGTH + 1),
          }),
        ).rejects.toThrow();
      },
    );

    it.each(cases)(
      "accepts an answer at the cap on %s",
      async (_n, dto, base) => {
        await expect(
          parse(dto, {
            ...base,
            formAnswer: "a".repeat(MAX_FORM_ANSWER_LENGTH),
          }),
        ).resolves.toBeDefined();
      },
    );

    it.each(cases)(
      "still allows no answer at all on %s",
      async (_n, dto, base) => {
        await expect(parse(dto, base)).resolves.toBeDefined();
      },
    );
  });

  describe("UpdateEventDto capacity", () => {
    const base = {
      title: "Fest",
      description: "x",
      visibility: "PUBLIC",
      startDate: "2099-01-01T18:00:00.000Z",
      categoryIds: [1],
    };

    it("rejects zero", async () => {
      /* The service guard that stops capacity dropping below the current
         GOING count is written `capacity > 0`, so zero skipped it entirely. */
      await expect(
        parse(UpdateEventDto, { ...base, capacity: 0 }),
      ).rejects.toThrow();
    });

    it("rejects a negative capacity", async () => {
      await expect(
        parse(UpdateEventDto, { ...base, capacity: -1 }),
      ).rejects.toThrow();
    });

    it("accepts a real capacity", async () => {
      await expect(
        parse(UpdateEventDto, { ...base, capacity: 50 }),
      ).resolves.toMatchObject({ capacity: 50 });
    });

    it("treats an explicit null as unlimited, not as zero", async () => {
      /* StringToNumberOrNull ran `new Number(null).valueOf()`, which is 0 -
         so a null capacity silently became an event nobody can register for,
         which is the very state this DTO change exists to prevent. */
      await expect(
        parse(UpdateEventDto, { ...base, capacity: null }),
      ).resolves.toMatchObject({ capacity: null });
    });

    it("treats an empty capacity field as unlimited", async () => {
      await expect(
        parse(UpdateEventDto, { ...base, capacity: "" }),
      ).resolves.toMatchObject({ capacity: null });
    });

    it("keeps a null latitude null", async () => {
      /* Same transformer, same bug: 0 is a real coordinate. */
      await expect(
        parse(UpdateEventDto, { ...base, latitude: null }),
      ).resolves.toMatchObject({ latitude: null });
    });

    it("still allows capacity to be omitted, meaning unlimited", async () => {
      await expect(parse(UpdateEventDto, base)).resolves.not.toHaveProperty(
        "capacity",
      );
    });
  });
});
