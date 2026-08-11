import { ConfigService } from "@nestjs/config";
import { BadRequestException } from "@nestjs/common";
import { AzureStorageService } from "./azure-storage.service";

const config = {
  AZURE_STORAGE_ACCOUNT: "peoplytest",
  AZURE_STORAGE_KEY: Buffer.from("not-a-real-key").toString("base64"),
  AZURE_STORAGE_SKIP_INIT: "true",
} as const;

const configService = {
  get: (key: keyof typeof config) => config[key],
} as unknown as ConfigService;

// Only `buffer` is read.
const fileWith = (buffer: Buffer) => ({ buffer }) as any;

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

describe("AzureStorageService.generateFileNameById", () => {
  let service: AzureStorageService;

  beforeEach(() => {
    service = new AzureStorageService(configService);
  });

  it("derives the extension from the content, not the claimed type", () => {
    expect(service.generateFileNameById("abc", fileWith(png))).toMatch(
      /\.png$/,
    );
    expect(service.generateFileNameById("abc", fileWith(jpeg))).toMatch(
      /\.jpg$/,
    );
  });

  it("refuses to name a blob for a non-image, so it is never uploaded", () => {
    expect(() =>
      service.generateFileNameById("abc", fileWith(Buffer.from("MZ\x90\x00"))),
    ).toThrow(BadRequestException);
  });

  it("uses a full UUID as the unguessable part", () => {
    expect(service.generateFileNameById("abc", fileWith(png))).toMatch(
      /^abc-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/,
    );
  });

  it("never repeats a name", () => {
    // The old Math.random().toString(36).substring(7) yielded 2-6 base36 chars;
    // over 200,000 samples 9 were 2 long, i.e. 1,296 possibilities. The blob
    // URL is the only thing guarding a private image, since nothing issues a
    // SAS token.
    const names = new Set(
      Array.from({ length: 10_000 }, () =>
        service.generateFileNameById("abc", fileWith(png)),
      ),
    );
    expect(names.size).toBe(10_000);
  });

  it("keeps the caller-supplied id as the prefix", () => {
    expect(service.generateFileNameById("event-123", fileWith(png))).toMatch(
      /^event-123-/,
    );
  });
});
