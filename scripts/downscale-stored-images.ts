import {
  BlobServiceClient,
  ContainerClient,
  StorageSharedKeyCredential,
} from "@azure/storage-blob";
import sharp from "sharp";
import { AzureStorageContainer } from "../src/azure/azure-storage.constants";
import { needsDownscaling, normalizeImage } from "../src/azure/image-normalize";

/**
 * Largest image this run will decode, in megapixels.
 *
 * This is a memory budget wearing a different unit. Decoding costs roughly
 * four bytes per pixel, so 25 megapixels is about 100 MB of pixel buffer, and
 * the service container has 512 MB with the API already living in it. The
 * default used to be 200, chosen to cover the two worst images in production,
 * and that was the bug: a 71.7 megapixel PNG needs 273 MB, which killed the
 * container and took the console session with it. Two runs died on the same
 * blob before this was understood.
 *
 * A skipped image is reported, not silently passed over. Raise this when
 * running somewhere with memory to spare, which is where those two belong.
 */
const MAX_MEGAPIXELS = Number(process.env.IMAGE_MAX_MEGAPIXELS ?? 25);

/**
 * How many blobs to rewrite before stopping, so the work can be taken in
 * bites instead of one long run. Re-running picks up where the last one left
 * off: the job is idempotent, and an image already inside the edge limit is
 * skipped on the header alone.
 */
const LIMIT = Number(
  process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ??
    Number.POSITIVE_INFINITY,
);

/**
 * Bytes read to answer "how many pixels is this" without downloading the file.
 *
 * Dimensions live in the header - PNG's IHDR is in the first 30 bytes, JPEG's
 * SOF usually within a few kB - so most blobs never need to be fetched whole.
 * Of the 663 images referenced in production, roughly a third are already
 * inside the limit, and this is what keeps those off the wire entirely.
 */
const HEADER_BYTES = 64 * 1024;

/* libvips keeps decoded operations in a cache and parallelises across cores.
 * Neither helps a job that touches each image once, and both cost memory that
 * this may not have: a console session shares the 512 MB service container,
 * and the run that died mid-dry-run died on exactly that. */
sharp.cache(false);
sharp.concurrency(1);

/**
 * Rewrites images that were stored before uploads were bounded.
 *
 * A profile picture in production was a 9.2 MB, 5184x3456 camera original
 * displayed as a 200 px avatar. Next's image optimizer timed out on it and the
 * browser rendered a broken-image icon, so the user saw a broken avatar with
 * no way to know why. Bounding new uploads fixes nobody who already has one.
 *
 * Each oversized blob is rewritten **under its own name**. That is the whole
 * point: `users.image` and `organizations.image` store the blob URL, so
 * keeping the name means no database row changes, no cache key changes, and
 * nobody has to re-upload anything. The image simply starts working.
 *
 * Reads the same `normalizeImage` the upload path uses, so the two cannot
 * drift into producing different results for the same file.
 *
 *   npm run images:downscale -- --dry-run    # report only, writes nothing
 *   npm run images:downscale -- --limit=25   # rewrite the next 25, then stop
 *   npm run images:downscale                 # rewrite everything
 */

const DRY_RUN = process.argv.includes("--dry-run");

interface Totals {
  inspected: number;
  rewritten: number;
  /** Too many pixels for this run's budget. Expected, not a fault. */
  tooBig: number;
  failed: number;
  bytesBefore: number;
  bytesAfter: number;
}

function requireEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is not set`);
  }

  return value;
}

function kB(bytes: number) {
  return `${Math.round(bytes / 1024)} kB`;
}

async function toBuffer(stream: NodeJS.ReadableStream) {
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

/**
 * Rewrites one blob if it is larger than the frontend will ever display.
 *
 * Returns the byte counts when it rewrote something, and `null` when the blob
 * was already fine. Throws only for a blob it could not read at all, which the
 * caller reports without stopping the run.
 */
async function readBlob(
  container: ContainerClient,
  blobName: string,
  bytes?: number,
) {
  const blockBlob = container.getBlockBlobClient(blobName);
  const download =
    bytes === undefined
      ? await blockBlob.download()
      : await blockBlob.download(0, bytes);

  return toBuffer(download.readableStreamBody as NodeJS.ReadableStream);
}

/**
 * Answers whether a blob is oversized from its header alone, so a blob that is
 * already fine is never pulled down in full.
 */
async function dimensionsFromHeader(
  container: ContainerClient,
  blobName: string,
) {
  try {
    const header = await readBlob(container, blobName, HEADER_BYTES);
    const metadata = await sharp(header, { limitInputPixels: false }).metadata();

    if (!metadata.width || !metadata.height) {
      return null;
    }

    return { width: metadata.width, height: metadata.height };
  } catch {
    /* Some encoders put the dimensions past the first chunk. Falling back to
       the full download is slower for those, and still correct. */
    return null;
  }
}

class TooManyPixelsError extends Error {
  constructor(megapixels: number) {
    super(
      `${megapixels.toFixed(1)} megapixels needs about ` +
        `${Math.round(megapixels * 4)} MB to decode, over the ` +
        `${MAX_MEGAPIXELS} megapixel budget. Re-run with a higher ` +
        "IMAGE_MAX_MEGAPIXELS somewhere with more memory.",
    );
    this.name = "TooManyPixelsError";
  }
}

/**
 * Refuses an image the run cannot afford to decode, from its header alone.
 *
 * The check has to happen here rather than inside `normalizeImage`, because by
 * the time that function runs the blob has already been downloaded and is one
 * decode away from the memory it cannot have. Deciding on the header means the
 * bytes are never fetched and the pixels are never materialised.
 */
function assertAffordable(dimensions: { width: number; height: number }) {
  const megapixels = (dimensions.width * dimensions.height) / 1e6;

  if (megapixels > MAX_MEGAPIXELS) {
    throw new TooManyPixelsError(megapixels);
  }
}

async function downscaleBlob(container: ContainerClient, blobName: string) {
  const fromHeader = await dimensionsFromHeader(container, blobName);

  if (fromHeader) {
    if (!needsDownscaling(fromHeader.width, fromHeader.height)) {
      return null;
    }

    assertAffordable(fromHeader);
  }

  const original = await readBlob(container, blobName);

  if (!fromHeader) {
    const metadata = await sharp(original, {
      limitInputPixels: false,
    }).metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;

    if (!needsDownscaling(width, height)) {
      return null;
    }

    assertAffordable({ width, height });
  }

  const blockBlob = container.getBlockBlobClient(blobName);
  const result = await normalizeImage(original, MAX_MEGAPIXELS * 1e6);

  if (!result.changed) {
    return null;
  }

  if (!DRY_RUN) {
    await blockBlob.upload(result.buffer, result.buffer.length);
  }

  return result;
}

function record(
  totals: Totals,
  containerName: string,
  blobName: string,
  result: Awaited<ReturnType<typeof downscaleBlob>>,
) {
  if (!result) return;

  console.log(
    `${containerName}/${blobName}\n` +
      `  ${result.before.width}x${result.before.height} ` +
      `(${kB(result.before.bytes)}) -> ` +
      `${result.after.width}x${result.after.height} ` +
      `(${kB(result.after.bytes)})`,
  );

  totals.rewritten += 1;
  totals.bytesBefore += result.before.bytes;
  totals.bytesAfter += result.after.bytes;
}

function recordFailure(
  totals: Totals,
  containerName: string,
  blobName: string,
  error: unknown,
) {
  if (error instanceof TooManyPixelsError) {
    totals.tooBig += 1;
    console.log(`${containerName}/${blobName}\n  ${error.message}`);
    return;
  }

  /* One unreadable blob must not stop the rest. Something that is not an image
     at all, or is truncated, lands here and is reported rather than aborting a
     run that is fixing everything else. */
  totals.failed += 1;
  console.error(
    `${containerName}/${blobName}: skipped - ${
      error instanceof Error ? error.message : error
    }`,
  );
}

async function downscaleContainer(
  client: BlobServiceClient,
  containerName: AzureStorageContainer,
  totals: Totals,
) {
  const container = client.getContainerClient(containerName);

  if (!(await container.exists())) {
    console.log(`${containerName}: does not exist, skipping`);
    return;
  }

  for await (const blob of container.listBlobsFlat()) {
    if (totals.rewritten >= LIMIT) return;

    totals.inspected += 1;

    try {
      record(totals, containerName, blob.name, await downscaleBlob(container, blob.name));
    } catch (error) {
      recordFailure(totals, containerName, blob.name, error);
    }
  }
}

async function main() {
  const account = requireEnv("AZURE_STORAGE_ACCOUNT");
  const client = new BlobServiceClient(
    `https://${account}.blob.core.windows.net`,
    new StorageSharedKeyCredential(account, requireEnv("AZURE_STORAGE_KEY")),
  );

  console.log(
    DRY_RUN
      ? "Dry run: reporting what would change, writing nothing.\n"
      : "Rewriting oversized images in place.\n",
  );

  const totals: Totals = {
    inspected: 0,
    rewritten: 0,
    tooBig: 0,
    failed: 0,
    bytesBefore: 0,
    bytesAfter: 0,
  };

  for (const containerName of Object.values(AzureStorageContainer)) {
    await downscaleContainer(client, containerName, totals);
  }

  console.log(
    `\nInspected ${totals.inspected}, ${
      DRY_RUN ? "would rewrite" : "rewrote"
    } ${totals.rewritten}, too big for this run ${totals.tooBig}, failed ${
      totals.failed
    }.`,
  );

  if (totals.tooBig > 0) {
    console.log(
      `Raise IMAGE_MAX_MEGAPIXELS above ${MAX_MEGAPIXELS} and re-run somewhere ` +
        "with more memory to take those.",
    );
  }

  if (totals.rewritten > 0) {
    console.log(`Storage: ${kB(totals.bytesBefore)} -> ${kB(totals.bytesAfter)}`);
  }

  if (totals.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
