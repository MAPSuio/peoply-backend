export const AZURE_BASE_URL = "https://peoply.blob.core.windows.net/";

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  avif: "image/avif",
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp",
};

const MODES = ["dry", "copy", "rewrite"] as const;

export type MigrationMode = (typeof MODES)[number];

export function keyFromAzureUrl(url: string): string {
  if (!url.startsWith(AZURE_BASE_URL)) {
    throw new Error(`Not an Azure image URL: ${url}`);
  }
  return decodeURIComponent(url.slice(AZURE_BASE_URL.length));
}

export function contentTypeFor(key: string): string {
  const extension = key.includes(".")
    ? key.slice(key.lastIndexOf(".") + 1).toLowerCase()
    : "";
  return CONTENT_TYPE_BY_EXTENSION[extension] ?? "application/octet-stream";
}

export function parseMigrationMode(argv: string[]): MigrationMode {
  const mode = argv[2] ?? "dry";
  if (!(MODES as readonly string[]).includes(mode)) {
    throw new Error(`Unknown mode "${mode}", expected ${MODES.join(", ")}`);
  }
  return mode as MigrationMode;
}
