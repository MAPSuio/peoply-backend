import { clampEmbed } from "./discord-alert.service";

const field = (name: string, value: string) => ({ name, value, inline: true });

describe("clampEmbed", () => {
  it("leaves an ordinary alert untouched", () => {
    const fields = [field("Path", "/wp-admin"), field("IP", "203.0.113.7")];
    const embed = clampEmbed("Suspicious path", fields);

    expect(embed.title).toBe("Suspicious path");
    expect(embed.fields).toEqual(fields);
  });

  it("cuts a field value to Discord's 1024 limit", () => {
    // The attacker-controlled one: `path` goes straight into a field value.
    // Over 1024 characters, Discord answers 400 and posts nothing — so a
    // prober using long URLs silently switched the alerting off.
    const embed = clampEmbed("Suspicious path", [
      field("Path", `/${"a".repeat(5000)}`),
    ]);

    expect(embed.fields[0].value.length).toBe(1024);
    expect(embed.fields[0].value.endsWith("…")).toBe(true);
  });

  it("cuts a field name to 256", () => {
    const embed = clampEmbed("t", [field("n".repeat(400), "v")]);
    expect(embed.fields[0].name.length).toBe(256);
  });

  it("cuts the title to 256", () => {
    const embed = clampEmbed("t".repeat(400), []);
    expect(embed.title.length).toBe(256);
  });

  it("keeps at most 25 fields", () => {
    const embed = clampEmbed(
      "t",
      Array.from({ length: 40 }, (_, i) => field(`n${i}`, `v${i}`)),
    );
    expect(embed.fields.length).toBe(25);
  });

  it("drops fields until the whole embed fits in 6000 characters", () => {
    // 25 maximum-length fields is 25,600 characters — every part within its
    // own limit, and still rejected on the total.
    const embed = clampEmbed(
      "t",
      Array.from({ length: 25 }, (_, i) => field(`n${i}`, "v".repeat(1024))),
    );

    const total =
      embed.title.length +
      embed.fields.reduce((sum, f) => sum + f.name.length + f.value.length, 0);

    expect(total).toBeLessThanOrEqual(6000);
    expect(embed.fields.length).toBeGreaterThan(0);
  });

  it("keeps the earliest fields when it has to drop some", () => {
    const embed = clampEmbed(
      "t",
      Array.from({ length: 25 }, (_, i) => field(`n${i}`, "v".repeat(1024))),
    );

    expect(embed.fields[0].name).toBe("n0");
  });

  it("does not mutate the caller's fields", () => {
    const fields = [field("Path", "x".repeat(2000))];
    clampEmbed("t", fields);
    expect(fields[0].value.length).toBe(2000);
  });

  it("produces a body Discord would accept for a maximally hostile alert", () => {
    const embed = clampEmbed("Burst 404 — possible scanning", [
      field("404 count", "10 in 60s"),
      field("Last path", `/${"%2e%2e%2f".repeat(900)}`),
      field("IP", "203.0.113.7"),
    ]);

    expect(embed.title.length).toBeLessThanOrEqual(256);
    for (const f of embed.fields) {
      expect(f.name.length).toBeLessThanOrEqual(256);
      expect(f.value.length).toBeLessThanOrEqual(1024);
    }
    expect(embed.fields.length).toBeLessThanOrEqual(25);
  });
});
