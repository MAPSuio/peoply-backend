import { createHash, randomUUID } from "crypto";

export function isUUID(uuid: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    uuid,
  );
}

export function createUuid() {
  return randomUUID();
}

export function createUuidV5(value: string, namespace: string) {
  const namespaceBytes = parseUuid(namespace);
  const valueBytes = Buffer.from(value, "utf8");
  const hash = createHash("sha1")
    .update(namespaceBytes)
    .update(valueBytes)
    .digest();

  const bytes = hash.subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  return formatUuid(bytes);
}

function parseUuid(uuid: string) {
  if (!isUUID(uuid)) {
    throw new Error("Invalid UUID namespace");
  }

  return Buffer.from(uuid.replace(/-/g, ""), "hex");
}

function formatUuid(bytes: Uint8Array) {
  const hex = Buffer.from(bytes).toString("hex");

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(
    12,
    16,
  )}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
