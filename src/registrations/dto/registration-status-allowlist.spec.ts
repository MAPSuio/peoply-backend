import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { RegStatus } from "../../generated/prisma/client";
import { ArrangerUpdateRegistrationDto } from "./arranger-update-registration.dto";
import { CreateRegistrationDto } from "./create-registration.dto";
import { UserUpdateRegistrationDto } from "./user-update-registration.dto";

const EVENT_ID = "3f1e9d4c-8b2a-4c6e-9f0d-7a5b3c1e2d4f";

const errorsFor = (dto: any, body: Record<string, unknown>) =>
  validateSync(plainToInstance(dto, body));

const propertiesRejected = (dto: any, body: Record<string, unknown>) =>
  errorsFor(dto, body).map((error) => error.property);

describe.each([
  ["CreateRegistrationDto", CreateRegistrationDto],
  ["UserUpdateRegistrationDto", UserUpdateRegistrationDto],
] as const)("%s regStatus allowlist", (_name, dto) => {
  it.each([RegStatus.GOING, RegStatus.NOT_GOING])(
    "lets a user send %s about themselves",
    (regStatus) => {
      expect(errorsFor(dto, { eventId: EVENT_ID, regStatus })).toHaveLength(0);
    },
  );

  it.each([RegStatus.WAITLISTED, RegStatus.BANNED, RegStatus.INVITED])(
    "refuses to let a user send %s about themselves",
    (regStatus) => {
      expect(propertiesRejected(dto, { eventId: EVENT_ID, regStatus })).toEqual(
        ["regStatus"],
      );
    },
  );

  it("refuses a registration without a status", () => {
    expect(propertiesRejected(dto, { eventId: EVENT_ID })).toEqual([
      "regStatus",
    ]);
  });

  it.each(["not-a-uuid", "", "3f1e9d4c8b2a4c6e9f0d7a5b3c1e2d4f"])(
    "refuses %p as an event id",
    (eventId) => {
      expect(
        propertiesRejected(dto, { eventId, regStatus: RegStatus.GOING }),
      ).toEqual(["eventId"]);
    },
  );
});

describe("ArrangerUpdateRegistrationDto regStatus allowlist", () => {
  it.each([RegStatus.BANNED, RegStatus.NOT_GOING])(
    "lets an arranger send %s about an attendee",
    (regStatus) => {
      expect(
        errorsFor(ArrangerUpdateRegistrationDto, { regStatus }),
      ).toHaveLength(0);
    },
  );

  it.each([RegStatus.GOING, RegStatus.WAITLISTED, RegStatus.INVITED])(
    "refuses to let an arranger hand out %s",
    (regStatus) => {
      expect(
        propertiesRejected(ArrangerUpdateRegistrationDto, { regStatus }),
      ).toEqual(["regStatus"]);
    },
  );

  it("takes attendance as a boolean only", () => {
    expect(
      propertiesRejected(ArrangerUpdateRegistrationDto, {
        regStatus: RegStatus.NOT_GOING,
        attendance: "yes",
      }),
    ).toEqual(["attendance"]);
  });
});
