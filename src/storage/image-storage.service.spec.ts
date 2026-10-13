import { ConfigService } from "@nestjs/config";
import { BadRequestException, HttpException } from "@nestjs/common";
import { ImageStorageService } from "./image-storage.service";
import { ImageContainer } from "./image-storage.constants";
import { MAX_QUEUED_DECODES } from "../azure/decode-slot";
import {
  MAX_IMAGE_INPUT_EDGE_PX,
  normalizeImage,
} from "../azure/image-normalize";
import sharp from "../azure/sharp-runtime";
import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

const config = {
  SPACES_ENDPOINT: "https://ams3.digitaloceanspaces.com",
  SPACES_BUCKET: "peoply-test",
  SPACES_KEY: "not-a-real-key",
  SPACES_SECRET: "not-a-real-secret",
  SPACES_PUBLIC_BASE_URL: "https://cdn.example.com",
} as const;

const configService = {
  get: (key: keyof typeof config) => config[key],
} as unknown as ConfigService;

// Only `buffer` is read.
const fileWith = (buffer: Buffer) => ({ buffer }) as any;

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

describe("ImageStorageService.generateFileNameById", () => {
  let service: ImageStorageService;

  beforeEach(() => {
    service = new ImageStorageService(configService);
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

describe("ImageStorageService.swapImage", () => {
  let service: ImageStorageService;
  let deleted: string[];

  const swap = (options: Record<string, unknown>) =>
    service.swapImage({
      ownerId: "owner-1",
      currentImageUrl: null,
      container: ImageContainer.PROFILE_IMAGES,
      conflictMessage: "either removed or added",
      ...options,
    } as any);

  beforeEach(() => {
    deleted = [];
    service = new ImageStorageService(configService);
    // The blob calls are the only thing that reaches Azure.
    jest
      .spyOn(service, "delete")
      .mockImplementation(async (fileName: string) => {
        deleted.push(fileName);
      });
    jest
      .spyOn(service, "upload")
      .mockImplementation(async (fileName: string) => ({
        url: `https://blob/profile-images/${fileName}`,
        colors: { primary: "#fd7b03", accent: null },
      }));
  });

  it("uploads and answers with the new URL", async () => {
    const result = await swap({ newImage: fileWith(png) });

    expect(result?.image).toMatch(/^https:\/\/blob\/profile-images\/owner-1-/);
  });

  it("hands back the colors of the picture it just stored", async () => {
    const result = await swap({ newImage: fileWith(png) });

    expect(result?.colors).toEqual({ primary: "#fd7b03", accent: null });
  });

  it("answers null for both the image and its colors when the image is removed", async () => {
    expect(await swap({ removeImage: true })).toEqual({
      image: null,
      colors: null,
    });
  });

  /* undefined leaves the columns alone. Collapsing it with the removal case
     would wipe the image every time something else was saved. */
  it("answers undefined when the request says nothing about the image", async () => {
    expect(await swap({})).toBeUndefined();
  });

  it("deletes the existing blob when it is replaced", async () => {
    await swap({
      currentImageUrl: "https://blob/profile-images/owner-1-old.png",
      newImage: fileWith(png),
    });

    expect(deleted).toEqual(["owner-1-old.png"]);
  });

  it("deletes the existing blob when it is removed", async () => {
    await swap({
      currentImageUrl: "https://blob/profile-images/owner-1-old.png",
      removeImage: true,
    });

    expect(deleted).toEqual(["owner-1-old.png"]);
  });

  it("leaves the existing blob alone when nothing about the image changed", async () => {
    await swap({ currentImageUrl: "https://blob/profile-images/keep.png" });

    expect(deleted).toEqual([]);
  });

  it("refuses to remove and upload in the same request", async () => {
    await expect(
      swap({ removeImage: true, newImage: fileWith(png) }),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it("does not touch storage when it refuses", async () => {
    await expect(
      swap({
        currentImageUrl: "https://blob/profile-images/owner-1-old.png",
        removeImage: true,
        newImage: fileWith(png),
      }),
    ).rejects.toThrow();

    expect(deleted).toEqual([]);
  });
});

/**
 * The refusals only exist so the uploader gets an answer it can act on. What
 * makes them worth anything is the status code they arrive as, and that is
 * decided here rather than in `image-normalize`, so it is checked here.
 */
describe("ImageStorageService.upload refusals", () => {
  const service = new ImageStorageService(configService);

  const strip = (width: number, height: number) =>
    sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 10, g: 10, b: 10 },
      },
    })
      .png()
      .toBuffer();

  const statusOf = async (upload: Promise<unknown>) => {
    try {
      await upload;
    } catch (error) {
      return error instanceof HttpException ? error.getStatus() : "not-http";
    }

    return "resolved";
  };

  it("answers 400 for an image too long on one side", async () => {
    const tooWide = await strip(MAX_IMAGE_INPUT_EDGE_PX + 1, 10);

    await expect(
      statusOf(service.upload("x.png", tooWide, ImageContainer.EVENTS)),
    ).resolves.toBe(400);
  });

  it("answers 503 when every decode slot is taken", async () => {
    const image = await strip(3000, 3000);
    const saturate = Array.from({ length: MAX_QUEUED_DECODES + 1 }, () =>
      normalizeImage(image).catch(() => undefined),
    );

    const status = await statusOf(
      service.upload("y.png", image, ImageContainer.EVENTS),
    );

    await Promise.all(saturate);

    expect(status).toBe(503);
  });
});

describe("ImageStorageService against Spaces", () => {
  let service: ImageStorageService;
  let sent: unknown[];

  beforeEach(() => {
    sent = [];
    service = new ImageStorageService(configService);
    jest
      .spyOn(service["s3"], "send")
      .mockImplementation(async (command: unknown) => {
        sent.push(command);
        return {};
      });
  });

  const image = () =>
    sharp({
      create: { width: 4, height: 4, channels: 3, background: "#fd7b03" },
    })
      .png()
      .toBuffer();

  it("stores the image under its container as a public object with its real type", async () => {
    await service.upload(
      "owner-1-a.png",
      await image(),
      ImageContainer.PROFILE_IMAGES,
    );

    expect(sent).toHaveLength(1);
    expect(sent[0]).toBeInstanceOf(PutObjectCommand);
    expect((sent[0] as PutObjectCommand).input).toMatchObject({
      Bucket: "peoply-test",
      Key: "profile-images/owner-1-a.png",
      ACL: "public-read",
      ContentType: "image/png",
    });
  });

  it("answers with the public URL rather than the API endpoint", async () => {
    const { url } = await service.upload(
      "owner-1-a.png",
      await image(),
      ImageContainer.EVENT_IMAGES,
    );

    expect(url).toBe("https://cdn.example.com/event-images/owner-1-a.png");
  });

  it("deletes the object under its container", async () => {
    await service.delete("owner-1-a.png", ImageContainer.ORGANIZATION_IMAGES);

    expect(sent[0]).toBeInstanceOf(DeleteObjectCommand);
    expect((sent[0] as DeleteObjectCommand).input).toEqual({
      Bucket: "peoply-test",
      Key: "organization-images/owner-1-a.png",
    });
  });
});
