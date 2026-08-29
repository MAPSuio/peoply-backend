import sharp from "./sharp-runtime";
import { readBrandColors } from "./image-colors";

async function logoOf(
  strokes: { color: string; width: number }[],
  background: string,
) {
  const size = 400;
  const bars = strokes
    .map(
      ({ color, width }, index) =>
        `<rect x="0" y="${index * 40}" width="${width}" height="30" fill="${color}" />`,
    )
    .join("");

  return await sharp(
    Buffer.from(
      `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="${background}" />${bars}</svg>`,
    ),
  )
    .png()
    .toBuffer();
}

describe("readBrandColors", () => {
  it("reads the logo color rather than the backdrop it sits on", async () => {
    const image = await logoOf([{ color: "#fd7b02", width: 300 }], "#111111");

    const colors = await readBrandColors(image);

    expect(colors?.primary).toBe("#fd7b02");
  });

  it("finds a thin stroke that covers a fraction of the picture", async () => {
    const image = await logoOf([{ color: "#0051f1", width: 20 }], "#ffffff");

    const colors = await readBrandColors(image);

    expect(colors?.primary).toBe("#0051f1");
  });

  it("names the second color when the logo has one in another hue", async () => {
    const image = await logoOf(
      [
        { color: "#e62239", width: 300 },
        { color: "#0ca3b1", width: 200 },
      ],
      "#ffffff",
    );

    const colors = await readBrandColors(image);

    expect(colors?.primary).toBe("#e62239");
    expect(colors?.accent).toBe("#0ca3b1");
  });

  it("leaves the accent unset when every color shares one hue", async () => {
    const image = await logoOf(
      [
        { color: "#0051f1", width: 300 },
        { color: "#1a63f5", width: 200 },
      ],
      "#ffffff",
    );

    const colors = await readBrandColors(image);

    expect(colors?.primary).toBe("#0051f1");
    expect(colors?.accent).toBeNull();
  });

  it("gives nothing back for a black and white logo, so the caller can fall back", async () => {
    const image = await logoOf([{ color: "#f5f5f5", width: 300 }], "#111111");

    expect(await readBrandColors(image)).toBeNull();
  });

  it("reads the same colors from the same picture every time", async () => {
    const image = await logoOf(
      [
        { color: "#e62239", width: 300 },
        { color: "#0ca3b1", width: 200 },
      ],
      "#ffffff",
    );

    expect(await readBrandColors(image)).toEqual(await readBrandColors(image));
  });

  it("ignores pixels the picture makes transparent", async () => {
    const image = await sharp({
      create: {
        width: 200,
        height: 200,
        channels: 4,
        background: { r: 253, g: 123, b: 2, alpha: 0 },
      },
    })
      .composite([
        {
          input: await sharp({
            create: {
              width: 40,
              height: 40,
              channels: 4,
              background: { r: 0, g: 195, b: 195, alpha: 1 },
            },
          })
            .png()
            .toBuffer(),
          top: 0,
          left: 0,
        },
      ])
      .png()
      .toBuffer();

    const colors = await readBrandColors(image);

    expect(colors?.primary).toBe("#00c3c3");
  });

  it("refuses a picture that is not an image at all", async () => {
    await expect(
      readBrandColors(Buffer.from("not an image")),
    ).rejects.toThrow();
  });
});
