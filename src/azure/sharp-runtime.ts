import sharp from "sharp";

export type { Metadata } from "sharp";

function releaseDecodedImagesInsteadOfCachingThem() {
  sharp.cache(false);
  sharp.concurrency(1);
}

releaseDecodedImagesInsteadOfCachingThem();

export default sharp;
