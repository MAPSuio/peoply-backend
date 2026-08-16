import sharp from "sharp";
import {
  MAX_IMAGE_EDGE_PX,
  needsDownscaling,
  normalizeImage,
} from "./image-normalize";

/**
 * The case this exists for: a 9.2 MB, 5184x3456 camera original stored as a
 * profile picture and displayed as a 200 px avatar. Next's image optimizer
 * timed out resizing it and the browser rendered a broken-image icon.
 */
describe("normalizeImage", () => {
  const solid = (width: number, height: number) =>
    sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 120, g: 80, b: 200 },
      },
    });

  it("brings a camera-sized photo down to the edge limit", async () => {
    const input = await solid(5184, 3456).jpeg().toBuffer();

    const result = await normalizeImage(input);

    expect(result.after.width).toBe(MAX_IMAGE_EDGE_PX);
    expect(result.changed).toBe(true);
    expect(result.before.width).toBe(5184);
  });

  it("keeps the aspect ratio", async () => {
    const input = await solid(4000, 2000).jpeg().toBuffer();

    const { after } = await normalizeImage(input);

    expect(after.width / after.height).toBeCloseTo(2, 2);
  });

  it("bounds the longest edge whichever way the image is turned", async () => {
    const input = await solid(2000, 4000).jpeg().toBuffer();

    const { after } = await normalizeImage(input);

    expect(Math.max(after.width, after.height)).toBe(MAX_IMAGE_EDGE_PX);
  });

  it("makes the file dramatically smaller", async () => {
    const input = await solid(5184, 3456).jpeg({ quality: 100 }).toBuffer();

    const { before, after } = await normalizeImage(input);

    expect(after.bytes).toBeLessThan(before.bytes / 4);
  });

  /* Upscaling a small avatar would only make it blurry and bigger. */
  it("leaves an already-small image at its own size", async () => {
    const input = await solid(200, 200).jpeg().toBuffer();

    const { after } = await normalizeImage(input);

    expect(after.width).toBe(200);
    expect(after.height).toBe(200);
  });

  /* The bug this rule exists for. 480 of the 663 images in production are
     PNGs, and most are photographs exported as PNG. Re-encoding those back to
     PNG made 162 of them larger than they started. */
  it("turns an opaque PNG photograph into a JPEG", async () => {
    const input = await solid(3000, 2000).png().toBuffer();

    const result = await normalizeImage(input);

    expect(result.format).toBe("jpeg");
    expect((await sharp(result.buffer).metadata()).format).toBe("jpeg");
    expect(result.after.bytes).toBeLessThan(result.before.bytes);
  });

  /* An alpha channel that is fully opaque is something an export tool added,
     not transparency anyone asked for. Reading `hasAlpha` alone is what kept
     these photographs in PNG. */
  it("treats a fully opaque alpha channel as no transparency", async () => {
    const input = await sharp({
      create: {
        width: 3000,
        height: 2000,
        channels: 4,
        background: { r: 90, g: 140, b: 60, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    expect((await sharp(input).metadata()).hasAlpha).toBe(true);

    expect((await normalizeImage(input)).format).toBe("jpeg");
  });

  /* Organization logos are PNGs with transparency. Flattening those onto a
     JPEG background would put a white box behind every logo on the site. */
  it("keeps a genuinely transparent PNG a PNG", async () => {
    const input = await sharp({
      create: {
        width: 3000,
        height: 3000,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer();

    const { buffer, after } = await normalizeImage(input);
    const metadata = await sharp(buffer).metadata();

    expect(metadata.format).toBe("png");
    expect(metadata.hasAlpha).toBe(true);
    expect(after.width).toBe(MAX_IMAGE_EDGE_PX);
  });

  it("keeps a JPEG a JPEG", async () => {
    const input = await solid(2400, 2400).jpeg().toBuffer();

    const { buffer } = await normalizeImage(input);

    expect((await sharp(buffer).metadata()).format).toBe("jpeg");
  });

  /* Camera originals carry GPS coordinates. A profile picture should not
     publish where it was taken. */
  it("strips EXIF", async () => {
    const input = await solid(2000, 2000)
      .withExif({ IFD0: { Copyright: "peoply", Software: "test" } })
      .jpeg()
      .toBuffer();

    expect((await sharp(input).metadata()).exif).toBeDefined();

    const { buffer } = await normalizeImage(input);

    expect((await sharp(buffer).metadata()).exif).toBeUndefined();
  });

  /* An image inside the limit is not the function's business. Decoding and
     re-encoding it would spend CPU to produce a file that is no better. */
  it("returns an image inside the limit byte-for-byte untouched", async () => {
    const input = await solid(800, 600).png({ compressionLevel: 9 }).toBuffer();

    const result = await normalizeImage(input);

    expect(result.buffer).toBe(input);
    expect(result.changed).toBe(false);
    expect(result.after).toEqual(result.before);
    expect(result.format).toBe("png");
  });

  it("does not convert the format of an image it leaves alone", async () => {
    const input = await solid(800, 600).jpeg().toBuffer();

    const result = await normalizeImage(input);

    expect(result.buffer).toBe(input);
    expect(result.format).toBe("jpeg");
  });
});

describe("needsDownscaling", () => {
  it.each([
    [5184, 3456, true],
    [MAX_IMAGE_EDGE_PX + 1, 100, true],
    [100, MAX_IMAGE_EDGE_PX + 1, true],
    [MAX_IMAGE_EDGE_PX, MAX_IMAGE_EDGE_PX, false],
    [200, 200, false],
  ])("%ix%i -> %s", (width, height, expected) => {
    expect(needsDownscaling(width, height)).toBe(expected);
  });
});
