import { sortByRelevance } from "./search";

describe("sortByRelevance", () => {
  const named = (name: string) => ({ name });
  const namesOf = (items: Array<{ name: string }>) =>
    items.map((item) => item.name);

  it("puts the closest match to the query first", () => {
    const items = [named("Kaffeslabberas"), named("Kaffe"), named("Kake")];

    expect(
      namesOf(sortByRelevance(items, "Kaffe", (item) => item.name)),
    ).toEqual(["Kaffe", "Kake", "Kaffeslabberas"]);
  });

  it("keeps the original order among items that are equally far off", () => {
    const items = [named("bbb"), named("ccc"), named("ddd")];

    expect(namesOf(sortByRelevance(items, "aaa", (item) => item.name))).toEqual(
      ["bbb", "ccc", "ddd"],
    );
  });

  it("leaves the input untouched", () => {
    const items = [named("Kake"), named("Kaffe")];

    sortByRelevance(items, "Kaffe", (item) => item.name);

    expect(namesOf(items)).toEqual(["Kake", "Kaffe"]);
  });

  it("returns everything it was given", () => {
    const items = [named("a"), named("b"), named("c")];

    expect(sortByRelevance(items, "a", (item) => item.name)).toHaveLength(3);
  });
});
