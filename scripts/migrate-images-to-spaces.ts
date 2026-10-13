import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { PrismaClient } from "../src/generated/prisma/client";
import { createPrismaAdapter } from "../src/prisma/prisma.adapter";
import {
  AZURE_BASE_URL,
  contentTypeFor,
  keyFromAzureUrl,
  parseMigrationMode,
} from "../src/storage/azure-migration";

const CONCURRENCY = 6;
const DOWNLOAD_TIMEOUT_MS = 30_000;
const PROGRESS_EVERY = 100;

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

async function azureImageUrls(prisma: PrismaClient) {
  const pattern = `${AZURE_BASE_URL}%`;
  const rows = await prisma.$queryRaw<{ image: string }[]>`
    SELECT image FROM organizations WHERE image LIKE ${pattern}
    UNION SELECT image FROM users WHERE image LIKE ${pattern}
    UNION SELECT image FROM events WHERE image LIKE ${pattern}`;
  return rows.map((row) => row.image);
}

function spaces() {
  const bucket = requireEnv("SPACES_BUCKET");
  const s3 = new S3Client({
    region: "us-east-1",
    endpoint: requireEnv("SPACES_ENDPOINT"),
    credentials: {
      accessKeyId: requireEnv("SPACES_KEY"),
      secretAccessKey: requireEnv("SPACES_SECRET"),
    },
  });
  const existsInSpaces = (Key: string) =>
    s3.send(new HeadObjectCommand({ Bucket: bucket, Key })).then(
      () => true,
      () => false,
    );
  return { s3, bucket, existsInSpaces };
}

async function copyAll(urls: string[]) {
  const { s3, bucket, existsInSpaces } = spaces();
  const tally = { copied: 0, skipped: 0, failed: [] as string[] };

  const copyOne = async (url: string) => {
    const key = keyFromAzureUrl(url);
    if (await existsInSpaces(key)) {
      tally.skipped++;
      return;
    }
    const response = await fetch(url, {
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`GET ${response.status}`);
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: Buffer.from(await response.arrayBuffer()),
        ACL: "public-read",
        ContentType: contentTypeFor(key),
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    tally.copied++;
  };

  const report = () =>
    console.log(JSON.stringify({ ...tally, failed: tally.failed.length }));

  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < urls.length) {
        const url = urls[next++];
        await copyOne(url).catch((error: Error) =>
          tally.failed.push(`${url} ${error.message}`),
        );
        if (next % PROGRESS_EVERY === 0) report();
      }
    }),
  );

  report();
  for (const failure of tally.failed) console.error(`FAILED ${failure}`);
  if (tally.failed.length > 0) process.exitCode = 1;
}

async function rewriteUrls(prisma: PrismaClient, urls: string[]) {
  const { existsInSpaces } = spaces();
  const missing: string[] = [];
  for (const url of urls) {
    if (!(await existsInSpaces(keyFromAzureUrl(url)))) missing.push(url);
  }
  if (missing.length > 0) {
    for (const url of missing) console.error(`MISSING ${url}`);
    throw new Error(
      `${missing.length} images are not in Spaces, run copy first`,
    );
  }
  const spacesBaseUrl = `${requireEnv("SPACES_PUBLIC_BASE_URL").replace(/\/+$/, "")}/`;
  const pattern = `${AZURE_BASE_URL}%`;
  const [organizations, users, events] = await prisma.$transaction([
    prisma.$executeRaw`UPDATE organizations SET image = replace(image, ${AZURE_BASE_URL}, ${spacesBaseUrl}) WHERE image LIKE ${pattern}`,
    prisma.$executeRaw`UPDATE users SET image = replace(image, ${AZURE_BASE_URL}, ${spacesBaseUrl}) WHERE image LIKE ${pattern}`,
    prisma.$executeRaw`UPDATE events SET image = replace(image, ${AZURE_BASE_URL}, ${spacesBaseUrl}) WHERE image LIKE ${pattern}`,
  ]);
  console.log(JSON.stringify({ organizations, users, events }));
}

async function main() {
  const mode = parseMigrationMode(process.argv);
  const prisma = new PrismaClient({ adapter: createPrismaAdapter() });

  try {
    const urls = await azureImageUrls(prisma);
    console.log(`${urls.length} image URLs still point at Azure`);
    if (mode === "copy") await copyAll(urls);
    if (mode === "rewrite") await rewriteUrls(prisma, urls);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
