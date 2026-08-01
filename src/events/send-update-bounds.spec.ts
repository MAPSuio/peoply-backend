import { ValidationPipe } from "@nestjs/common";
import { SendUpdateDto } from "./dto/send-update.dto";

/* POST /events/:id/update mails every attending user. The three free-text
   fields were unbounded, and replyTo reached both the Reply-To header and an
   href in the template. */
describe("SendUpdateDto bounds", () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });

  const valid = {
    subject: "Endret rom",
    body: "Vi flytter til Kristen Nygaards hus.",
    visibility: "GOING",
    sendEmail: true,
  };

  const parse = (body: Record<string, unknown>) =>
    pipe.transform(body, { type: "body", metatype: SendUpdateDto });

  it("accepts a normal update", async () => {
    await expect(parse(valid)).resolves.toMatchObject({
      subject: "Endret rom",
    });
  });

  it("accepts a real address as replyTo", async () => {
    await expect(
      parse({ ...valid, replyTo: "styret@digitus.no" }),
    ).resolves.toMatchObject({ replyTo: "styret@digitus.no" });
  });

  it("still allows replyTo to be omitted", async () => {
    await expect(parse(valid)).resolves.not.toHaveProperty("replyTo");
  });

  it("rejects a replyTo that is not an address", async () => {
    await expect(
      parse({ ...valid, replyTo: "not-an-address" }),
    ).rejects.toThrow();
  });

  it("rejects a replyTo carrying a quote", async () => {
    /* The value is interpolated into href="mailto:${replyTo}?subject=...",
       so a quote used to end the attribute. @IsEmail closes that off. */
    await expect(
      parse({ ...valid, replyTo: 'a@b.no" onmouseover="alert(1)' }),
    ).rejects.toThrow();
  });

  it("rejects a subject past the cap", async () => {
    await expect(
      parse({ ...valid, subject: "a".repeat(151) }),
    ).rejects.toThrow();
  });

  it("accepts a subject at the cap", async () => {
    await expect(
      parse({ ...valid, subject: "a".repeat(150) }),
    ).resolves.toBeDefined();
  });

  it("rejects a body past the cap", async () => {
    await expect(parse({ ...valid, body: "a".repeat(5001) })).rejects.toThrow();
  });

  it("still rejects an empty subject or body", async () => {
    await expect(parse({ ...valid, subject: "" })).rejects.toThrow();
    await expect(parse({ ...valid, body: "" })).rejects.toThrow();
  });

  it("strips unknown fields", async () => {
    await expect(
      parse({ ...valid, azureMessageId: "spoofed" }),
    ).resolves.not.toHaveProperty("azureMessageId");
  });
});
