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

  /* Organization logos are PNGs with transparency. Flattening those onto a
     JPEG background would put a black box behind every logo on the site. */
  it("keeps a transparent PNG a PNG", async () => {
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

  /* Re-encoding a small PNG can come out larger than it went in; storing the
     worse copy for the sake of having run would be a regression. */
  it("keeps the original when processing would gain nothing", async () => {
    const input = await sharp({
      create: {
        width: 64,
        height: 64,
        channels: 4,
        background: { r: 10, g: 200, b: 30, alpha: 0.5 },
      },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();

    const result = await normalizeImage(input);

    if (!result.changed) {
      expect(result.buffer).toBe(input);
      expect(result.after).toEqual(result.before);
    } else {
      expect(result.after.bytes).toBeLessThan(result.before.bytes);
    }
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
