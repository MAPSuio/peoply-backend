import { runOnDecodeSlot } from "./decode-slot";
import sharp, { type Metadata } from "./sharp-runtime";

/**
 * Longest edge, in pixels, that a stored image is allowed to have.
 *
 * The largest anything is ever displayed is the event card and the
 * organization banner; `deviceSizes` in the frontend's next.config.js tops out
 * at 1920 and an avatar renders at 200. 1600 sits above every real display
 * size while cutting a modern phone photo to a fraction of its pixels.
 */
export const MAX_IMAGE_EDGE_PX = 1600;

/** Visually lossless for photographs, and roughly a tenth of the bytes. */
const JPEG_QUALITY = 82;

/**
 * Bound on the *decoded* size sharp will work on.
 *
 * `MAX_IMAGE_BYTES` bounds the upload, but bytes are not what costs anything:
 * a 4 MB JPEG can decode to 24 megapixels, and it is the pixels that take the
 * CPU and the memory. A decompression bomb is small on the wire and enormous
 * once decoded, so this is the limit that actually protects the process.
 *
 * 100 megapixels, matching the backfill. The largest image in production is
 * 71.7 and it measured at +61 MB of RSS to decode and resize, so this is not a
 * number anything real approaches: a 48 megapixel phone shooting at full
 * resolution lands at half of it. It is a floor under absurdity, not a
 * judgement about the picture.
 */
const MAX_INPUT_PIXELS = 100_000_000;

/**
 * Longest edge, in pixels, an image is allowed to have on the way in.
 *
 * The pixel ceiling above does not bound either edge, and peak memory follows
 * the width rather than the pixel count: libvips holds whole scanlines, so a
 * 100000x1000 PNG is exactly 100 megapixels, weighs 3.2 MB on the wire, passes
 * every other limit here and still peaks at 467 MB of RSS in a 512 MB
 * container. The same 100 megapixels at ordinary proportions costs 181 MB.
 *
 * 20000 measured at 238 MB, which leaves room for a second upload to be in
 * flight. Nothing real comes close: a 48 megapixel phone is 8000 across, and
 * the widest image in production is 5184.
 */
export const MAX_IMAGE_INPUT_EDGE_PX = 20_000;

/**
 * What the upload path catches to answer 400 rather than 500.
 *
 * The reasons an image is refused before decoding are open-ended - pixels
 * today, edge length now, whatever the next measurement turns up - and every
 * one of them wants the same answer at the boundary. Catching the base means
 * the next one is handled the day it is written rather than the day someone
 * notices the 500s.
 */
export class ImageRejectedError extends Error {}

/**
 * Thrown instead of sharp's raw error when an image decodes to more pixels
 * than the caller allows, so the upload path can answer 400 with something a
 * person can act on rather than 500 with a stack trace.
 *
 * "Megapixels" is a number about the file, not about the person holding the
 * phone, so the message leads with what to do and keeps the measurement as the
 * detail it is.
 */
export class ImageTooLargeError extends ImageRejectedError {
  constructor(
    readonly megapixels: number,
    readonly limit: number,
  ) {
    super(
      "This image has too many pixels for us to process. Export it at a " +
        `smaller resolution and try again. (${megapixels.toFixed(1)} ` +
        `megapixels, limit is ${(limit / 1e6).toFixed(0)}.)`,
    );
    this.name = "ImageTooLargeError";
  }
}

/** Thrown when one edge is long enough to hurt on its own. */
export class ImageTooWideError extends ImageRejectedError {
  constructor(
    readonly edgePixels: number,
    readonly limit: number,
  ) {
    super(
      "This image is too long on one side for us to process. Export it at a " +
        `smaller resolution and try again. (${edgePixels} pixels on the ` +
        `longest side, limit is ${limit}.)`,
    );
    this.name = "ImageTooWideError";
  }
}

export interface ImageDimensions {
  width: number;
  height: number;
  bytes: number;
}

export interface NormalizedImage {
  buffer: Buffer;
  before: ImageDimensions;
  after: ImageDimensions;
  /** False when the original was kept because processing gained nothing. */
  changed: boolean;
  /** What the bytes actually are now, which the source extension may not say. */
  format: "jpeg" | "png";
}

/** Whether an image is larger than anything the frontend will ever display. */
export function needsDownscaling(width: number, height: number) {
  return Math.max(width, height) > MAX_IMAGE_EDGE_PX;
}

/**
 * Whether the alpha channel is carrying anything, as opposed to merely being
 * present.
 *
 * An export tool will happily attach a fully opaque alpha channel to a
 * photograph. Reading `hasAlpha` alone therefore classifies plain photos as
 * "needs transparency" and keeps them in PNG, which is what made 162 images
 * grow rather than shrink.
 *
 * `stats()` is the expensive part: unlike the resize, it materialises the
 * whole decoded image rather than streaming it in strips. Measured on a
 * 100 megapixel PNG with an alpha channel, 11.45 MB on the wire and well
 * inside the upload limit: metadata() 81 MB of RSS, the resize 163 MB,
 * stats() on the same input 507 MB, against a 512 MB container. So it runs on
 * the downscaled copy, which asks the same question of at most 1600x1600
 * pixels, and only when there is an alpha channel to ask about.
 */
async function usesTransparency(
  input: Buffer,
  hasAlpha: boolean | undefined,
  maxInputPixels: number,
) {
  if (!hasAlpha) {
    return false;
  }

  try {
    const { isOpaque } = await sharp(input, {
      limitInputPixels: maxInputPixels,
    }).stats();

    return !isOpaque;
  } catch {
    /* If the statistics cannot be computed, keep the alpha channel. Storing a
       slightly larger PNG is recoverable; flattening away real transparency
       and putting a white box behind a logo is not. */
    return true;
  }
}

/**
 * Downscales an image to something the frontend can actually serve.
 *
 * Uploads used to be stored exactly as they arrived. One profile picture in
 * production was a 9.2 MB, 5184x3456 camera original, displayed as a 200 px
 * avatar. Next's image optimizer has a time budget for fetching and resizing
 * the source, an 18-megapixel JPEG blows through it, and the browser gets a
 * 500 and renders a broken-image icon. The user sees a broken avatar with no
 * way to know why.
 *
 * The byte limit on upload does not prevent this and never could: it bounds
 * the compressed size, and the cost is in the decoded pixels. So bound the
 * pixels, here, once, on the way in.
 *
 * The output format follows the *content*, not the source format: an image
 * that uses transparency stays PNG, everything else becomes JPEG.
 *
 * Preserving the source format was the obvious first answer, and it was wrong.
 * A dry run over the 663 images in production found 480 of them stored as
 * PNG, and most of those are photographs: an event poster shot on a phone and
 * exported as PNG. Re-encoding a downscaled photograph back to PNG produced a
 * file *larger* than the original in 162 of the 426 cases, 23 MB of growth in
 * total. One event image went from 0.97 MB to 1.72 MB while shrinking in
 * pixels, which is a worse artefact on every axis that matters.
 *
 * Opacity rather than the presence of an alpha channel decides it. Plenty of
 * these photographs carry a fully opaque alpha channel their export tool added,
 * and treating that as "needs transparency" is what kept them in PNG. sharp's
 * `stats().isOpaque` answers the question that actually matters, so a logo with
 * real transparency stays PNG and a photograph does not.
 *
 * `rotate()` with no argument applies the EXIF orientation and drops the tag,
 * which also strips the rest of the EXIF block. That is a side effect worth
 * having - camera originals carry GPS coordinates - but it is not a reason to
 * touch anything: an image inside the limit keeps whatever metadata it came
 * with, because re-encoding it to strip a tag would cost more than the tag.
 */
/** Refuses an image whose decoded size the caller cannot afford. */
async function assertDecodable(input: Buffer, maxInputPixels: number) {
  const probe = await sharp(input, { limitInputPixels: false }).metadata();
  const width = probe.width ?? 0;
  const height = probe.height ?? 0;
  const longestEdge = Math.max(width, height);

  if (longestEdge > MAX_IMAGE_INPUT_EDGE_PX) {
    throw new ImageTooWideError(longestEdge, MAX_IMAGE_INPUT_EDGE_PX);
  }

  const megapixels = (width * height) / 1e6;

  if (megapixels * 1e6 > maxInputPixels) {
    throw new ImageTooLargeError(megapixels, maxInputPixels);
  }
}

function dimensionsOf(metadata: Metadata, bytes: number): ImageDimensions {
  return {
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    bytes,
  };
}

function downscale(input: Buffer, maxInputPixels: number) {
  return (
    sharp(input, { limitInputPixels: maxInputPixels })
      .rotate()
      /* No `withoutEnlargement`: the caller only gets here when an edge is
         already over the limit, so `inside` can only shrink. */
      .resize({
        width: MAX_IMAGE_EDGE_PX,
        height: MAX_IMAGE_EDGE_PX,
        fit: "inside",
      })
  );
}

function flattenToJpeg(pipeline: ReturnType<typeof downscale>) {
  return pipeline
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true });
}

/** Resizes to the edge limit and encodes in whichever format the content wants. */
async function encodeDownscaled(
  input: Buffer,
  metadata: Metadata,
  maxInputPixels: number,
) {
  if (!metadata.hasAlpha) {
    return {
      buffer: await flattenToJpeg(downscale(input, maxInputPixels)).toBuffer(),
      format: "jpeg" as const,
    };
  }

  const downscaled = await downscale(input, maxInputPixels)
    .png({ compressionLevel: 9 })
    .toBuffer();

  if (await usesTransparency(downscaled, true, maxInputPixels)) {
    return { buffer: downscaled, format: "png" as const };
  }

  return {
    buffer: await flattenToJpeg(sharp(downscaled)).toBuffer(),
    format: "jpeg" as const,
  };
}

export async function normalizeImage(
  input: Buffer,
  /* A decompression-bomb guard. Two images in production decode to 71.7 and
     62.2 megapixels while weighing 1.1 and 2.6 MB on disk, which is the shape
     of one whether or not anyone meant it that way.

     Not a memory budget, though it was written as one. libvips streams the
     decode in strips: the 71.7 megapixel image measured at +61 MB of RSS in an
     otherwise empty process, not the +287 MB that four-bytes-per-pixel
     predicts. The ceiling is here to stop something absurd, not to ration
     memory image by image. */
  maxInputPixels: number = MAX_INPUT_PIXELS,
): Promise<NormalizedImage> {
  return runOnDecodeSlot(() => normalizeOnSlot(input, maxInputPixels));
}

/* Everything below touches pixels, `metadata()` included: reading the header
   of a 100 megapixel image measured at 81 MB of RSS. So the slot is taken for
   the whole of it, not just the resize. */
async function normalizeOnSlot(
  input: Buffer,
  maxInputPixels: number,
): Promise<NormalizedImage> {
  await assertDecodable(input, maxInputPixels);

  const metadata = await sharp(input, {
    limitInputPixels: maxInputPixels,
  }).metadata();
  const before = dimensionsOf(metadata, input.length);

  /* An image inside the limit is left exactly as it arrived. Re-encoding it
     would burn CPU on every upload to produce a file that is no better and
     frequently worse, and `metadata()` reads headers only, so deciding this
     costs no pixel work - which matters, because everything below decodes the
     whole image. */
  if (!needsDownscaling(before.width, before.height)) {
    return {
      buffer: input,
      before,
      after: before,
      changed: false,
      format: metadata.format === "png" ? "png" : "jpeg",
    };
  }

  const { buffer, format } = await encodeDownscaled(
    input,
    metadata,
    maxInputPixels,
  );

  return {
    buffer,
    before,
    after: dimensionsOf(await sharp(buffer).metadata(), buffer.length),
    changed: true,
    format,
  };
}
