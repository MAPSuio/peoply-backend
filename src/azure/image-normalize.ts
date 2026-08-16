import sharp from "sharp";

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
}

/** Whether an image is larger than anything the frontend will ever display. */
export function needsDownscaling(width: number, height: number) {
  return Math.max(width, height) > MAX_IMAGE_EDGE_PX;
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
 * The source format is preserved rather than normalised to JPEG. Organization
 * logos are PNGs with transparency, and flattening those onto a JPEG
 * background would put a black box behind every logo on the site.
 *
 * `withoutEnlargement` leaves a small image at its own size instead of
 * upscaling it into a blurry larger one. `rotate()` with no argument applies
 * the EXIF orientation and drops the tag, which also strips the rest of the
 * EXIF block: camera originals carry GPS coordinates, and a profile picture
 * should not publish where it was taken.
 */
export async function normalizeImage(input: Buffer): Promise<NormalizedImage> {
  const metadata = await sharp(input, {
    limitInputPixels: MAX_INPUT_PIXELS,
  }).metadata();

  const before: ImageDimensions = {
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    bytes: input.length,
  };

  const pipeline = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize({
      width: MAX_IMAGE_EDGE_PX,
      height: MAX_IMAGE_EDGE_PX,
      fit: "inside",
      withoutEnlargement: true,
    });

  const buffer = await (metadata.format === "png"
    ? pipeline.png({ compressionLevel: 9 })
    : pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
  ).toBuffer();

  const resized = needsDownscaling(before.width, before.height);

  /* Re-encoding a small PNG can come out larger than it went in. When nothing
     was resized and the result is not smaller, the original is the better
     artefact - keep it rather than storing a worse copy for the sake of
     having run. */
  if (!resized && buffer.length >= input.length) {
    return { buffer: input, before, after: before, changed: false };
  }

  const after = await sharp(buffer).metadata();

  return {
    buffer,
    before,
    after: {
      width: after.width ?? 0,
      height: after.height ?? 0,
      bytes: buffer.length,
    },
    changed: true,
  };
}
