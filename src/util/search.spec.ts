import { buildDescriptionSearchQuery } from "./search";

describe("buildDescriptionSearchQuery", () => {
  it("ANDs the words of an ordinary phrase", () => {
    expect(buildDescriptionSearchQuery("coffee run")).toBe("coffee & run");
  });

  it("lowercases terms", () => {
    expect(buildDescriptionSearchQuery("Coffee RUN")).toBe("coffee & run");
  });

  it("returns a lone term unchanged", () => {
    expect(buildDescriptionSearchQuery("coffee")).toBe("coffee");
  });

  it("keeps letters outside ASCII", () => {
    expect(buildDescriptionSearchQuery("blåtur på Grünerløkka")).toBe(
      "blåtur & på & grünerløkka",
    );
  });

  it("keeps digits and underscores", () => {
    expect(buildDescriptionSearchQuery("kurs_2 uke 3")).toBe(
      "kurs_2 & uke & 3",
    );
  });

  describe("input that used to produce `syntax error in tsquery`", () => {
    // Each of these reached to_tsquery unchanged and returned HTTP 500.
    it.each([
      ["rock & roll", "rock & roll"],
      ["this | that", "this & that"],
      ["!negated", "negated"],
      ["(unbalanced", "unbalanced"],
      ["prefix:*", "prefix"],
      ["it's here", "its & here"],
      ["a <-> b", "a & b"],
    ])("%j becomes %j", (input, expected) => {
      expect(buildDescriptionSearchQuery(input)).toBe(expected);
    });
  });

  describe("nothing searchable left", () => {
    it.each(["", "   ", "&&&", "!", "()", "&  |"])(
      "%j yields undefined",
      (input) => {
        expect(buildDescriptionSearchQuery(input)).toBeUndefined();
      },
    );
  });

  it("collapses runs of whitespace rather than emitting empty terms", () => {
    expect(buildDescriptionSearchQuery("coffee    run\t\nnow")).toBe(
      "coffee & run & now",
    );
  });

  it("drops operator-only words from between real ones", () => {
    expect(buildDescriptionSearchQuery("coffee & run")).toBe("coffee & run");
    expect(buildDescriptionSearchQuery("coffee && !! run")).toBe(
      "coffee & run",
    );
  });

  it("never emits a term containing a tsquery operator", () => {
    const hostile = "a&b|c!d(e)f:*g<->h'i\"j\\k";
    const query = buildDescriptionSearchQuery(hostile);
    expect(query).toBeDefined();
    expect(query).not.toMatch(/[&|!()<>:*'"\\]/);
  });
});
