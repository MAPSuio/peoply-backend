import { ValidationPipe } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { Prisma } from "../../generated/prisma/client";
import { SearchEventDto } from "./search-event.dto";
import { UpdateEventDto } from "./update-event.dto";

const errorsFor = async (dto: object, cls: any) =>
  validate(plainToInstance(cls, dto), {
    whitelist: true,
    forbidNonWhitelisted: false,
  });

describe("SearchEventDto.orderBy", () => {
  it.each(["title", "startDate", "createdAt"])(
    "accepts %s",
    async (orderBy) => {
      expect(await errorsFor({ orderBy }, SearchEventDto)).toHaveLength(0);
    },
  );

  /* These reached `orderBy: { [orderBy]: direction }` and made Prisma raise a
     validation error the exception filter does not catch — an unauthenticated
     500, since GET /events needs no cookie. */
  it.each([
    ["eventArrangers", "a relation, not a column"],
    ["registrations", "a relation, not a column"],
    ["nonsense", "not a field at all"],
    ["__proto__", "not a field at all"],
  ])("rejects %s (%s)", async (orderBy) => {
    expect(
      (await errorsFor({ orderBy }, SearchEventDto)).length,
    ).toBeGreaterThan(0);
  });

  it("accepts every column Prisma reports, so it cannot drift from the schema", async () => {
    for (const field of Object.keys(Prisma.EventScalarFieldEnum)) {
      expect(await errorsFor({ orderBy: field }, SearchEventDto)).toHaveLength(
        0,
      );
    }
  });
});

describe("UpdateEventDto", () => {
  const valid = {
    title: "A title",
    description: "A description",
    visibility: "PUBLIC",
    startDate: "2099-01-01T00:00:00.000Z",
    categoryIds: [1],
  };

  /* `Event` has no arrangerId column — the relation lives in EventArranger —
     so this used to reach trx.event.update and 500.

     Driven through the real ValidationPipe rather than plainToInstance:
     stripping is the pipe's job, and main.ts configures it exactly like this. */
  it("drops an inherited arrangerId instead of passing it to Prisma", async () => {
    const pipe = new ValidationPipe({ whitelist: true, transform: true });

    const result = (await pipe.transform(
      { ...valid, arrangerId: "6ce090e8-5609-43c6-b952-f6579c68b1e8" },
      { type: "body", metatype: UpdateEventDto },
    )) as Record<string, unknown>;

    expect(result.arrangerId).toBeUndefined();
    expect(result.title).toBe("A title");
  });

  it("still accepts an otherwise valid update", async () => {
    expect(await errorsFor(valid, UpdateEventDto)).toHaveLength(0);
  });
});
