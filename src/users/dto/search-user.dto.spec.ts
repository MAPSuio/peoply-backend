import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { MAX_PAGE_SIZE } from "../../util/pagination";
import { SearchUserDto } from "./search-user.dto";

const errorsFor = async (dto: object) =>
  validate(plainToInstance(SearchUserDto, dto));

describe("SearchUserDto.name", () => {
  it.each(["Kjell", "Kjell Hansen", "Anne Berit Marie Olsen"])(
    "accepts %s",
    async (name) => {
      expect(await errorsFor({ name })).toHaveLength(0);
    },
  );

  /* The measured attack: ~3000 tokens built roughly 20 000 ILIKE predicates
     against the users table from a single ~9 KB request. 922 ms against a
     30-row dev table, against 64 ms for an ordinary search. */
  it("rejects a query with thousands of words", async () => {
    const errors = await errorsFor({ name: Array(3000).fill("aa").join(" ") });

    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects a name longer than 100 characters", async () => {
    expect((await errorsFor({ name: "a".repeat(101) })).length).toBeGreaterThan(
      0,
    );
  });

  /* The token cap has to bite on its own, not only as a side effect of the
     length limit — otherwise raising the length would quietly reopen this. */
  it("rejects too many words even well inside the length limit", async () => {
    const errors = await errorsFor({ name: "a ".repeat(40).trim() });

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe("name");
  });

  it("still accepts a ten-word name", async () => {
    expect(await errorsFor({ name: "a ".repeat(10).trim() })).toHaveLength(0);
  });
});

describe("SearchUserDto.skip", () => {
  it("accepts a realistic offset", async () => {
    expect(await errorsFor({ skip: 100 })).toHaveLength(0);
  });

  /* `take` was capped and `skip` was not, so walking skip upwards paged through
     the entire user table. */
  it("rejects an offset far past the end of the table", async () => {
    expect((await errorsFor({ skip: 9_999_999 })).length).toBeGreaterThan(0);
  });

  it("accepts the last page inside the cap", async () => {
    expect(await errorsFor({ skip: MAX_PAGE_SIZE * 10 })).toHaveLength(0);
  });
});
