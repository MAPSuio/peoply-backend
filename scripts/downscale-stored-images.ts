import {
  BlobServiceClient,
  ContainerClient,
  StorageSharedKeyCredential,
} from "@azure/storage-blob";
import sharp from "sharp";
import { AzureStorageContainer } from "../src/azure/azure-storage.constants";
import { needsDownscaling, normalizeImage } from "../src/azure/image-normalize";

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
 *   npm run images:downscale                 # rewrite
 */

const DRY_RUN = process.argv.includes("--dry-run");

interface Totals {
  inspected: number;
  rewritten: number;
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
async function downscaleBlob(container: ContainerClient, blobName: string) {
  const blockBlob = container.getBlockBlobClient(blobName);
  const download = await blockBlob.download();
  const original = await toBuffer(
    download.readableStreamBody as NodeJS.ReadableStream,
  );
  const metadata = await sharp(original).metadata();

  if (!needsDownscaling(metadata.width ?? 0, metadata.height ?? 0)) {
    return null;
  }

  const result = await normalizeImage(original);

  if (!result.changed) {
    return null;
  }

  if (!DRY_RUN) {
    await blockBlob.upload(result.buffer, result.buffer.length);
  }

  return result;
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
    totals.inspected += 1;

    try {
      const result = await downscaleBlob(container, blob.name);

      if (!result) continue;

      console.log(
        `${containerName}/${blob.name}\n` +
          `  ${result.before.width}x${result.before.height} ` +
          `(${kB(result.before.bytes)}) -> ` +
          `${result.after.width}x${result.after.height} ` +
          `(${kB(result.after.bytes)})`,
      );

      totals.rewritten += 1;
      totals.bytesBefore += result.before.bytes;
      totals.bytesAfter += result.after.bytes;
    } catch (error) {
      /* One unreadable blob must not stop the rest. Something that is not an
         image at all, or is truncated, lands here and is reported rather than
         aborting a run that is fixing everything else. */
      totals.failed += 1;
      console.error(
        `${containerName}/${blob.name}: skipped - ${
          error instanceof Error ? error.message : error
        }`,
      );
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
    } ${totals.rewritten}, failed ${totals.failed}.`,
  );

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
