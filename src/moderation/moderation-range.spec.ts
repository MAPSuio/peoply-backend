import { ValidationPipe } from "@nestjs/common";
import { ModerationRangeDto } from "./dto/moderation-range.dto";

/* `days` went straight into `Date.now() - days * 86_400_000`, so anything that
   was not a number produced an Invalid Date and a 500 out of Prisma. */
describe("ModerationRangeDto", () => {
  /* The real pipe rather than plainToInstance: whitelisting and the implicit
     string -> number conversion only happen here. */
  const pipe = new ValidationPipe({ whitelist: true, transform: true });

  const parse = (query: Record<string, unknown>) =>
    pipe.transform(query, {
      type: "query",
      metatype: ModerationRangeDto,
    });

  it("coerces the query string to a number", async () => {
    await expect(parse({ days: "7" })).resolves.toMatchObject({ days: 7 });
  });

  it("rejects a non-numeric window", async () => {
    await expect(parse({ days: "abc" })).rejects.toThrow();
  });

  it("rejects a fractional window", async () => {
    await expect(parse({ days: "1.5" })).rejects.toThrow();
  });

  it("rejects zero and negative windows", async () => {
    await expect(parse({ days: "0" })).rejects.toThrow();
    await expect(parse({ days: "-5" })).rejects.toThrow();
  });

  it("rejects a window past the upper bound", async () => {
    await expect(parse({ days: "100000" })).rejects.toThrow();
  });

  it("falls back to a default when the window is omitted", async () => {
    /* Omitting it used to mean NaN, which is the same 500 by another route. */
    await expect(parse({})).resolves.toMatchObject({ days: 30 });
  });

  it("produces a window that survives the arithmetic the service does", async () => {
    const { days } = (await parse({ days: "7" })) as ModerationRangeDto;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    expect(Number.isNaN(since.getTime())).toBe(false);
  });

  it("strips unknown query parameters", async () => {
    await expect(
      parse({ days: "7", orderBy: "id" }),
    ).resolves.not.toHaveProperty("orderBy");
  });
});
