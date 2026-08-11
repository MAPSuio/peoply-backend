import { escapeHtml } from "./html";
import { buildWaitlistedToGoingHtmlEmail } from "./email";
import { Event } from "../generated/prisma/client";

describe("escapeHtml", () => {
  it.each([
    ["&", "&amp;"],
    ["<", "&lt;"],
    [">", "&gt;"],
    ['"', "&quot;"],
    ["'", "&#39;"],
  ])("escapes %s", (input, expected) => {
    expect(escapeHtml(input)).toBe(expected);
  });

  it("escapes the ampersand first so entities are not double-decoded", () => {
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });

  it("leaves ordinary text alone", () => {
    expect(escapeHtml("Fest på Chateau Neuf – 20:00")).toBe(
      "Fest på Chateau Neuf – 20:00",
    );
  });

  it.each([
    [null, ""],
    [undefined, ""],
  ])("turns %s into an empty string", (input, expected) => {
    expect(escapeHtml(input)).toBe(expected);
  });
});

describe("buildWaitlistedToGoingHtmlEmail", () => {
  it("neutralises markup in an event title", () => {
    const event = {
      /* An ICS-imported title is written by whoever owns the remote calendar. */
      title: '<img src=x onerror="alert(1)">',
      urlId: "ABCDEFGH",
    } as Event;

    const html = buildWaitlistedToGoingHtmlEmail(event);

    /* The words survive as inert text - what must not survive is the tag
       that would make the browser act on them. */
    expect(html).not.toContain("<img");
    expect(html).not.toContain('onerror="');
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("cannot break out of the href attribute", () => {
    const event = {
      title: 'x" onmouseover="alert(1)',
      urlId: 'A" onclick="alert(1)',
    } as Event;

    const html = buildWaitlistedToGoingHtmlEmail(event);

    expect(html).not.toContain('onmouseover="');
    expect(html).not.toContain('onclick="');
  });
});
