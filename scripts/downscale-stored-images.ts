import {
  BlobServiceClient,
  StorageSharedKeyCredential,
} from "@azure/storage-blob";
import sharp from "sharp";
import { AzureStorageContainer } from "../src/azure/azure-storage.constants";
import {
  needsDownscaling,
  normalizeImage,
} from "../src/azure/image-normalize";

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

  let inspected = 0;
  let rewritten = 0;
  let failed = 0;
  let bytesBefore = 0;
  let bytesAfter = 0;

  for (const containerName of Object.values(AzureStorageContainer)) {
    const container = client.getContainerClient(containerName);

    if (!(await container.exists())) {
      console.log(`${containerName}: does not exist, skipping`);
      continue;
    }

    for await (const blob of container.listBlobsFlat()) {
      inspected += 1;
      const blockBlob = container.getBlockBlobClient(blob.name);

      try {
        const download = await blockBlob.download();
        const original = await toBuffer(
          download.readableStreamBody as NodeJS.ReadableStream,
        );
        const metadata = await sharp(original).metadata();
        const width = metadata.width ?? 0;
        const height = metadata.height ?? 0;

        if (!needsDownscaling(width, height)) {
          continue;
        }

        const result = await normalizeImage(original);

        if (!result.changed) {
          continue;
        }

        console.log(
          `${containerName}/${blob.name}\n` +
            `  ${result.before.width}x${result.before.height} ` +
            `(${kB(result.before.bytes)}) -> ` +
            `${result.after.width}x${result.after.height} ` +
            `(${kB(result.after.bytes)})`,
        );

        bytesBefore += result.before.bytes;
        bytesAfter += result.after.bytes;
        rewritten += 1;

        if (!DRY_RUN) {
          await blockBlob.upload(result.buffer, result.buffer.length);
        }
      } catch (error) {
        failed += 1;
        /* One unreadable blob must not stop the rest. A blob that is not an
           image at all, or is truncated, lands here and is reported rather
           than aborting a run that is fixing everything else. */
        console.error(
          `${containerName}/${blob.name}: skipped - ${
            error instanceof Error ? error.message : error
          }`,
        );
      }
    }
  }

  console.log(
    `\nInspected ${inspected}, ${
      DRY_RUN ? "would rewrite" : "rewrote"
    } ${rewritten}, failed ${failed}.`,
  );

  if (rewritten > 0) {
    console.log(`Storage: ${kB(bytesBefore)} -> ${kB(bytesAfter)}`);
  }

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
