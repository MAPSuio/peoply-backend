import {
  MAX_TEXT_CHARACTERS,
  TRUNCATION_MARKER,
  clampUserText,
} from "./untrusted-content";

const OVERLONG = "a".repeat(MAX_TEXT_CHARACTERS + 500);

describe("clampUserText", () => {
  it("leaves text a person could plausibly have written alone", () => {
    const description = "Kaffe og kode på Blindern, ta med laptop.";

    expect(clampUserText({ description })).toEqual({ description });
  });

  it("cuts text long enough to crowd out everything around it", () => {
    const clamped = clampUserText({ description: OVERLONG }) as {
      description: string;
    };

    expect(clamped.description).toHaveLength(MAX_TEXT_CHARACTERS);
    expect(clamped.description.endsWith(TRUNCATION_MARKER)).toBe(true);
  });

  it("reaches text nested inside a page of results", () => {
    const clamped = clampUserText({
      data: [
        { event: { arranger: { organization: { description: OVERLONG } } } },
      ],
    }) as {
      data: [
        { event: { arranger: { organization: { description: string } } } },
      ];
    };

    expect(
      clamped.data[0].event.arranger.organization.description.endsWith(
        TRUNCATION_MARKER,
      ),
    ).toBe(true);
  });

  it("keeps the shape and the non-text values a caller depends on", () => {
    const value = {
      id: "b0a1",
      goingCount: 12,
      isPublic: true,
      startDate: new Date("2026-09-01T10:00:00.000Z"),
      categories: [1, 2],
      cancelledAt: null,
      missing: undefined,
    };

    expect(clampUserText(value)).toEqual(value);
  });

  it("hands back something a caller can still serialise when it loops", () => {
    const looping: Record<string, unknown> = { description: OVERLONG };
    looping.self = looping;

    const serialised = JSON.stringify(clampUserText(looping));

    expect(serialised).not.toContain(OVERLONG);
  });

  it("clamps a branch reached twice, not only the first time", () => {
    const shared = { description: OVERLONG };

    const serialised = JSON.stringify(
      clampUserText({ first: shared, second: shared }),
    );

    expect(serialised).not.toContain(OVERLONG);
  });

  it("stops descending before a deeply nested structure exhausts the stack", () => {
    let deep: unknown = { description: OVERLONG };
    for (let level = 0; level < 5000; level += 1) deep = { nested: deep };

    const serialised = JSON.stringify(clampUserText(deep));

    expect(serialised).not.toContain(OVERLONG);
  });
});
