import sharp from "sharp";

export type { Metadata } from "sharp";

function limitMemoryHeldByImageDecoding() {
  sharp.cache(false);
  sharp.concurrency(1);
}

limitMemoryHeldByImageDecoding();

export default sharp;
