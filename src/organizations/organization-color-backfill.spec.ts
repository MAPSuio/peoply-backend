import {
  organizationsLeftToColor,
  parseLimit,
  storeColorsIfImageUnchanged,
  summarize,
} from "./organization-color-backfill";

describe("parseLimit", () => {
  it("reads the number the caller asked for", () => {
    expect(parseLimit(["--limit=25"])).toBe(25);
  });

  it("has no ceiling when the caller did not ask for one", () => {
    expect(parseLimit([])).toBe(Number.POSITIVE_INFINITY);
  });

  it("refuses a limit that is not a number, rather than treating it as no limit", () => {
    expect(() => parseLimit(["--limit=invalid"])).toThrow(/--limit/);
  });

  it("refuses a negative limit", () => {
    expect(() => parseLimit(["--limit=-3"])).toThrow(/--limit/);
  });

  it("refuses a fractional limit", () => {
    expect(() => parseLimit(["--limit=2.5"])).toThrow(/--limit/);
  });

  it("refuses an empty limit rather than reading it as none", () => {
    expect(() => parseLimit(["--limit="])).toThrow(/--limit/);
  });

  it("refuses a limit with something appended to it", () => {
    expect(() => parseLimit(["--limit=1=extra"])).toThrow(/--limit/);
  });
});

describe("organizationsLeftToColor", () => {
  it("asks only for organizations that have a logo and no color yet", async () => {
    const findMany = jest.fn().mockResolvedValue([]);

    await organizationsLeftToColor({ findMany } as never, 10);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { image: { not: null }, imagePrimaryColor: null },
        take: 10,
      }),
    );
  });

  it("asks for all of them when there is no limit", async () => {
    const findMany = jest.fn().mockResolvedValue([]);

    await organizationsLeftToColor(
      { findMany } as never,
      Number.POSITIVE_INFINITY,
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: undefined }),
    );
  });
});

describe("storeColorsIfImageUnchanged", () => {
  const organization = {
    id: "org-1",
    name: "MAPS",
    image: "https://blob/maps.png",
  };
  const colors = { primary: "#e62239", accent: "#0ca3b1" };

  it("writes both colors while the row still points at the logo it read", async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });

    const stored = await storeColorsIfImageUnchanged(
      { updateMany } as never,
      organization,
      colors,
    );

    expect(stored).toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "org-1", image: "https://blob/maps.png" },
      data: { imagePrimaryColor: "#e62239", imageAccentColor: "#0ca3b1" },
    });
  });

  it("leaves the row alone when an upload replaced the logo mid-run", async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });

    expect(
      await storeColorsIfImageUnchanged(
        { updateMany } as never,
        organization,
        colors,
      ),
    ).toBe(false);
  });
});

describe("summarize", () => {
  it("says what it wrote", () => {
    expect(summarize({ written: 3, colorless: 1, failed: 0 }, false)).toBe(
      "wrote 3, colorless 1, failed 0",
    );
  });

  it("says what it would have written on a dry run", () => {
    expect(summarize({ written: 3, colorless: 0, failed: 2 }, true)).toBe(
      "would write 3, colorless 0, failed 2",
    );
  });
});
