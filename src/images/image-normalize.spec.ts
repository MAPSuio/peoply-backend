import sharp from "./sharp-runtime";
import { DecoderBusyError, MAX_QUEUED_DECODES } from "./decode-slot";
import {
  ImageRejectedError,
  ImageTooLargeError,
  ImageTooWideError,
  MAX_IMAGE_EDGE_PX,
  MAX_IMAGE_INPUT_EDGE_PX,
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

/**
 * A byte limit cannot see this: two images in production decode to 71.7 and
 * 62.2 megapixels while weighing 1.1 and 2.6 MB on disk. The ceiling is a
 * guard against that shape, set well above anything a camera produces, not a
 * second opinion on whether the upload was reasonable.
 */
describe("normalizeImage pixel ceiling", () => {
  const wide = (width: number, height: number) =>
    sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 10, g: 10, b: 10 },
      },
    }).png();

  it("refuses an image that decodes past the ceiling", async () => {
    const input = await wide(4000, 4000).toBuffer();

    await expect(normalizeImage(input, 8_000_000)).rejects.toThrow(
      ImageTooLargeError,
    );
  });

  it("says how big it was and what the limit is", async () => {
    const input = await wide(4000, 4000).toBuffer();

    await expect(normalizeImage(input, 8_000_000)).rejects.toThrow(
      /Export it at a smaller resolution.*16\.0 megapixels, limit is 8/s,
    );
  });

  /* The backfill raises the ceiling precisely so it can rewrite those two. */
  it("processes the same image when the caller allows the pixels", async () => {
    const input = await wide(4000, 4000).toBuffer();

    const result = await normalizeImage(input, 50_000_000);

    expect(result.after.width).toBe(MAX_IMAGE_EDGE_PX);
  });
});

/**
 * The pixel ceiling does not bound either edge on its own. A 100000x1000 PNG
 * is exactly 100 megapixels, weighs 3.2 MB on the wire and passes every limit
 * above, and libvips holds a scanline at a time: measured peak RSS is 467 MB
 * in a 512 MB container, against 181 MB for the same pixel count at ordinary
 * proportions. Peak memory tracks the *width*, so the width needs its own
 * limit.
 */
describe("normalizeImage edge ceiling", () => {
  const strip = (width: number, height: number) =>
    sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 10, g: 10, b: 10 },
      },
    }).png();

  it("refuses an image wider than the decoder can afford", async () => {
    const input = await strip(MAX_IMAGE_INPUT_EDGE_PX + 1, 10).toBuffer();

    await expect(normalizeImage(input)).rejects.toThrow(ImageTooWideError);
  });

  it("refuses it on the tall edge too", async () => {
    const input = await strip(10, MAX_IMAGE_INPUT_EDGE_PX + 1).toBuffer();

    await expect(normalizeImage(input)).rejects.toThrow(ImageTooWideError);
  });

  it("says which edge it was and what the limit is", async () => {
    const input = await strip(MAX_IMAGE_INPUT_EDGE_PX + 1, 10).toBuffer();

    await expect(normalizeImage(input)).rejects.toThrow(
      /Export it at a smaller resolution.*20001 pixels.*limit is 20000/s,
    );
  });

  it("accepts an image sitting exactly on the limit", async () => {
    const input = await strip(MAX_IMAGE_INPUT_EDGE_PX, 10).toBuffer();

    const result = await normalizeImage(input);

    expect(result.after.width).toBe(MAX_IMAGE_EDGE_PX);
  });

  /* Both refusals have to reach the 400 the upload path answers with, which
     means one catch, not one per reason. */
  it("refuses both sizes under a single catchable type", async () => {
    const tooWide = await strip(MAX_IMAGE_INPUT_EDGE_PX + 1, 10).toBuffer();
    const tooManyPixels = await strip(4000, 4000).toBuffer();

    await expect(normalizeImage(tooWide)).rejects.toThrow(ImageRejectedError);
    await expect(normalizeImage(tooManyPixels, 8_000_000)).rejects.toThrow(
      ImageRejectedError,
    );
  });
});

/**
 * Peak RSS is per decode, so the container size is a statement about how many
 * can be in flight at once, not just how big one may be. Four concurrent
 * uploads of a legal image are enough to pass 512 MB, and every upload route
 * is a `PATCH` any logged-in user can issue repeatedly.
 *
 * The gate therefore has to sit inside `normalizeImage`, where there is no
 * other way through: the four upload endpoints share one call site today, and
 * a fifth added next year gets the bound whether or not anyone remembers it.
 */
describe("normalizeImage concurrency", () => {
  it("refuses the upload that arrives past the queue rather than decoding it", async () => {
    const input = await sharp({
      create: {
        width: 3000,
        height: 3000,
        channels: 3,
        background: { r: 10, g: 10, b: 10 },
      },
    })
      .png()
      .toBuffer();

    const attempts = Array.from({ length: MAX_QUEUED_DECODES + 2 }, () =>
      normalizeImage(input),
    );
    const outcomes = await Promise.allSettled(attempts);
    const refused = outcomes.filter(
      (outcome) =>
        outcome.status === "rejected" &&
        outcome.reason instanceof DecoderBusyError,
    );

    expect(refused).toHaveLength(1);
  });
});
