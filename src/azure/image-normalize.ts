import sharp, { type Metadata } from "sharp";

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
 */
const MAX_INPUT_PIXELS = 50_000_000;

/**
 * Thrown instead of sharp's raw error when an image decodes to more pixels
 * than the caller allows, so the upload path can answer 400 with something a
 * person can act on rather than 500 with a stack trace.
 */
export class ImageTooLargeError extends Error {
  constructor(
    readonly megapixels: number,
    readonly limit: number,
  ) {
    super(
      `Image is ${megapixels.toFixed(1)} megapixels, which is over the ` +
        `${(limit / 1e6).toFixed(0)} megapixel limit.`,
    );
    this.name = "ImageTooLargeError";
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
 * grow rather than shrink. `stats()` decodes the image to answer this, so it
 * only runs when there is an alpha channel to ask about.
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
async function assertWithinPixelCeiling(input: Buffer, maxInputPixels: number) {
  const probe = await sharp(input, { limitInputPixels: false }).metadata();
  const megapixels = ((probe.width ?? 0) * (probe.height ?? 0)) / 1e6;

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

/** Resizes to the edge limit and encodes in whichever format the content wants. */
async function encodeDownscaled(
  input: Buffer,
  metadata: Metadata,
  maxInputPixels: number,
) {
  const keepAlpha = await usesTransparency(
    input,
    metadata.hasAlpha,
    maxInputPixels,
  );

  const pipeline = sharp(input, { limitInputPixels: maxInputPixels })
    .rotate()
    /* No `withoutEnlargement`: the caller only gets here when an edge is
       already over the limit, so `inside` can only shrink. */
    .resize({
      width: MAX_IMAGE_EDGE_PX,
      height: MAX_IMAGE_EDGE_PX,
      fit: "inside",
    });

  const buffer = await (keepAlpha
    ? pipeline.png({ compressionLevel: 9 })
    : pipeline
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
  ).toBuffer();

  return { buffer, format: keepAlpha ? ("png" as const) : ("jpeg" as const) };
}

export async function normalizeImage(
  input: Buffer,
  /* Two images in production decode to 71.7 and 62.2 megapixels while
     weighing 1.1 and 2.6 MB, which is what a decompression bomb looks like
     whether or not anyone meant it that way. The service container has 512 MB
     and the larger of the two needs 273 MB for the pixel buffer alone, so the
     upload path must refuse them: OOM-killing the API is worse than rejecting
     an image. The backfill overrides this, because those two are precisely the
     ones that need fixing, and it can be run somewhere with memory to spare. */
  maxInputPixels: number = MAX_INPUT_PIXELS,
): Promise<NormalizedImage> {
  await assertWithinPixelCeiling(input, maxInputPixels);

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
