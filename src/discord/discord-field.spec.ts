import { toDiscordFieldValue } from "./discord-field";

describe("toDiscordFieldValue", () => {
  it("passes an ordinary name through unchanged", () => {
    expect(toDiscordFieldValue("Digitus")).toBe("Digitus");
  });

  /* The attack this exists for: Discord 400s the entire webhook on a field
     value over 1024 characters, and reportOrganization only logs that — so an
     organization with a long enough name could never be reported to anyone. */
  it("caps a name long enough to make Discord reject the whole alert", () => {
    const value = toDiscordFieldValue("a".repeat(2000));

    expect(value.length).toBeLessThanOrEqual(256);
    expect(value.endsWith("…")).toBe(true);
  });

  it("collapses newlines so the value cannot fake extra fields", () => {
    expect(toDiscordFieldValue("Ekte\n\n**Org-ID**\nnoe annet")).toBe(
      "Ekte \\*\\*Org-ID\\*\\* noe annet",
    );
  });

  it.each([
    ["**bold**", "\\*\\*bold\\*\\*"],
    ["_em_", "\\_em\\_"],
    ["`code`", "\\`code\\`"],
    ["[link](http://x)", "\\[link\\](http://x)"],
    ["> quote", "\\> quote"],
    ["# heading", "\\# heading"],
  ])("escapes markdown in %s", (input, expected) => {
    expect(toDiscordFieldValue(input)).toBe(expected);
  });

  /* Backslash has to go first, or escaping the rest would corrupt it. */
  it("escapes a backslash before anything else", () => {
    expect(toDiscordFieldValue("a\\*b")).toBe("a\\\\\\*b");
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["an empty string", ""],
    ["only whitespace", "   \n  "],
  ])("falls back for %s", (_label, input) => {
    expect(toDiscordFieldValue(input)).toBe("—");
  });

  /* Parentheses are not markup on their own — only as the tail of a link, and
     escaping the bracket already breaks that. Leaving them alone keeps ordinary
     values readable. */
  it("leaves parentheses in an ordinary value alone", () => {
    expect(toDiscordFieldValue("Ola Nordmann (ola@example.com)")).toBe(
      "Ola Nordmann (ola@example.com)",
    );
  });

  it("takes a caller-supplied fallback", () => {
    expect(toDiscordFieldValue(null, "Ukjent")).toBe("Ukjent");
  });
});
