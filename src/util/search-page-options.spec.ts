import { DEFAULT_SEARCH_PAGE_SIZE, searchPageOptionsOf } from "./pagination";

describe("searchPageOptionsOf", () => {
  it("answers the first default-sized page when the caller asked for nothing", () => {
    expect(searchPageOptionsOf({})).toEqual({
      skip: 0,
      take: DEFAULT_SEARCH_PAGE_SIZE,
      orderBy: "updatedAt",
      orderDirection: "asc",
    });
  });

  it("keeps every field the caller did send", () => {
    expect(
      searchPageOptionsOf({
        skip: 20,
        take: 5,
        orderBy: "createdAt",
        orderDirection: "desc",
      }),
    ).toEqual({
      skip: 20,
      take: 5,
      orderBy: "createdAt",
      orderDirection: "desc",
    });
  });

  it("treats an explicit zero skip and take as the caller's choice", () => {
    expect(searchPageOptionsOf({ skip: 0, take: 0 })).toMatchObject({
      skip: 0,
      take: 0,
    });
  });
});
