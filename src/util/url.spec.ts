import { isHttpUrl } from "./url";

describe("isHttpUrl", () => {
  it.each([
    "https://example.com/event",
    "http://example.com/event",
    "https://example.com:8443/a?b=c#d",
    "  https://example.com/padded  ",
  ])("accepts %s", (value) => {
    expect(isHttpUrl(value)).toBe(true);
  });

  it.each([
    ["javascript:alert(1)", "executes instead of navigating"],
    ["JavaScript:alert(1)", "scheme is case-insensitive"],
    ["  javascript:alert(1)", "leading whitespace does not help"],
    ["data:text/html,<script>alert(1)</script>", "data URLs render markup"],
    ["vbscript:msgbox(1)", "legacy but still executes"],
    ["file:///etc/passwd", "not a web URL"],
    ["ftp://example.com/x", "not a web URL"],
    ["example.com", "no protocol at all"],
    ["", "empty"],
    ["   ", "whitespace only"],
  ])("rejects %s (%s)", (value) => {
    expect(isHttpUrl(value)).toBe(false);
  });

  it.each([null, undefined, 42, {}, []])(
    "rejects the non-string %p",
    (value) => {
      expect(isHttpUrl(value)).toBe(false);
    },
  );
});
