import sharp from "./sharp-runtime";

export interface BrandColors {
  primary: string;
  accent: string | null;
}

const COLOR_LEVELS_PER_CHANNEL = 16;
const COLOR_BUCKET_SIZE = 256 / COLOR_LEVELS_PER_CHANNEL;
const OPAQUE_ENOUGH_ALPHA = 128;
const MIN_CHROMA = 0.15;
const DISTINCT_HUE_DEGREES = 30;
const MAX_DECODED_PIXELS = 100_000_000;
const RGBA_CHANNELS = 4;

interface ColorBucket {
  index: number;
  pixelCount: number;
  redSum: number;
  greenSum: number;
  blueSum: number;
}

type Rgb = [red: number, green: number, blue: number];

function chromaOf([red, green, blue]: Rgb) {
  return (Math.max(red, green, blue) - Math.min(red, green, blue)) / 255;
}

function hueOf([red, green, blue]: Rgb) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const span = max - Math.min(r, g, b);

  if (span === 0) return 0;
  if (max === r) return ((g - b) / span + (g < b ? 6 : 0)) * 60;
  if (max === g) return ((b - r) / span + 2) * 60;
  return ((r - g) / span + 4) * 60;
}

function hueDistance(first: number, second: number) {
  const difference = Math.abs(first - second) % 360;
  return difference > 180 ? 360 - difference : difference;
}

function bucketIndexOf([red, green, blue]: Rgb) {
  return (
    Math.floor(red / COLOR_BUCKET_SIZE) *
      COLOR_LEVELS_PER_CHANNEL *
      COLOR_LEVELS_PER_CHANNEL +
    Math.floor(green / COLOR_BUCKET_SIZE) * COLOR_LEVELS_PER_CHANNEL +
    Math.floor(blue / COLOR_BUCKET_SIZE)
  );
}

function countColorfulPixelsPerBucket(pixels: Buffer) {
  const buckets = new Map<number, ColorBucket>();

  for (
    let offset = 0;
    offset + RGBA_CHANNELS <= pixels.length;
    offset += RGBA_CHANNELS
  ) {
    if (pixels[offset + 3] < OPAQUE_ENOUGH_ALPHA) continue;

    const color: Rgb = [pixels[offset], pixels[offset + 1], pixels[offset + 2]];
    if (chromaOf(color) < MIN_CHROMA) continue;

    const index = bucketIndexOf(color);
    const bucket = buckets.get(index) ?? {
      index,
      pixelCount: 0,
      redSum: 0,
      greenSum: 0,
      blueSum: 0,
    };

    bucket.pixelCount += 1;
    bucket.redSum += color[0];
    bucket.greenSum += color[1];
    bucket.blueSum += color[2];
    buckets.set(index, bucket);
  }

  return [...buckets.values()];
}

function byPixelCountThenBucketIndex(first: ColorBucket, second: ColorBucket) {
  return second.pixelCount - first.pixelCount || first.index - second.index;
}

function averageColorOf(bucket: ColorBucket): Rgb {
  return [
    Math.round(bucket.redSum / bucket.pixelCount),
    Math.round(bucket.greenSum / bucket.pixelCount),
    Math.round(bucket.blueSum / bucket.pixelCount),
  ];
}

function toHex(color: Rgb) {
  return `#${color.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function getBrandColorsFromPixels(pixels: Buffer): BrandColors | null {
  const ranked = countColorfulPixelsPerBucket(pixels)
    .sort(byPixelCountThenBucketIndex)
    .map(averageColorOf);

  if (ranked.length === 0) return null;

  const primary = ranked[0];
  const primaryHue = hueOf(primary);
  const accent = ranked
    .slice(1)
    .find(
      (color) => hueDistance(hueOf(color), primaryHue) >= DISTINCT_HUE_DEGREES,
    );

  return { primary: toHex(primary), accent: accent ? toHex(accent) : null };
}

export async function readBrandColors(
  image: Buffer,
): Promise<BrandColors | null> {
  const pixels = await sharp(image, { limitInputPixels: MAX_DECODED_PIXELS })
    .toColourspace("srgb")
    .ensureAlpha()
    .raw()
    .toBuffer();

  return getBrandColorsFromPixels(pixels);
}
