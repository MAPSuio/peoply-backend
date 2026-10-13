import { HttpException, Injectable, Logger } from "@nestjs/common";
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import {
  ImageContainer,
  containerStoresBrandColors,
} from "./image-storage.constants";
import { assertIsImage, extensionFor } from "../azure/image-upload";
import { DecoderBusyError } from "../azure/decode-slot";
import { ImageRejectedError, normalizeImage } from "../azure/image-normalize";
import { type BrandColors, readBrandColors } from "../azure/image-colors";

export type ImageChange =
  | { image: string; colors: BrandColors | null }
  | { image: null; colors: null }
  | undefined;

/**
 * Images live in one DigitalOcean Space, one key prefix per container, so a
 * URL that pointed at the old Azure container maps to the same path here.
 * The stored URL is built from the public (CDN) base rather than taken from
 * the S3 client, which only knows the API endpoint.
 */
@Injectable()
export class ImageStorageService {
  private readonly logger = new Logger(ImageStorageService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;

  constructor(configService: ConfigService) {
    this.s3 = new S3Client({
      region: "us-east-1",
      endpoint: configService.get<string>("SPACES_ENDPOINT"),
      credentials: {
        accessKeyId: `${configService.get<string>("SPACES_KEY")}`,
        secretAccessKey: `${configService.get<string>("SPACES_SECRET")}`,
      },
    });
    this.bucket = `${configService.get<string>("SPACES_BUCKET")}`;
    this.publicBaseUrl = `${configService.get<string>("SPACES_PUBLIC_BASE_URL")}`;
  }

  /**
   * Every image in every container goes through here - profile pictures and
   * organization logos via `swapImage`, event images from `EventsService`
   * directly - so it is the one place a size bound can be applied without
   * being forgotten at a fourth call site later.
   */
  async upload(fileName: string, file: Buffer, containerName: ImageContainer) {
    let image: Awaited<ReturnType<typeof normalizeImage>>;

    try {
      image = await normalizeImage(file);
    } catch (error) {
      /* A 71-megapixel PNG weighing 1 MB passes the byte limit and still needs
         273 MB decoded, which this container does not have. Refusing it is the
         right answer; doing so with a 400 the uploader can understand rather
         than a 500 is the point of catching it here. */
      if (error instanceof ImageRejectedError) {
        throw new HttpException({ message: error.message }, 400);
      }

      /* Not the uploader's fault and not permanent, so 503 rather than 400:
         the same file succeeds as soon as a slot frees up. */
      if (error instanceof DecoderBusyError) {
        throw new HttpException({ message: error.message }, 503);
      }

      throw error;
    }

    if (image.changed) {
      this.logger.log(
        `Downscaled ${fileName}: ${image.before.width}x${image.before.height} ` +
          `(${Math.round(image.before.bytes / 1024)} kB) -> ` +
          `${image.after.width}x${image.after.height} ` +
          `(${Math.round(image.after.bytes / 1024)} kB)`,
      );
    }

    const key = `${containerName}/${fileName}`;
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: image.buffer,
        ACL: "public-read",
        ContentType: assertIsImage(image.buffer),
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );

    return {
      url: `${this.publicBaseUrl}/${key}`,
      colors: containerStoresBrandColors(containerName)
        ? await this.readColorsQuietly(image.buffer, containerName)
        : null,
    };
  }

  private async readColorsQuietly(
    image: Buffer,
    containerName: ImageContainer,
  ) {
    try {
      return await readBrandColors(image);
    } catch (error) {
      this.logger.warn(
        `Could not read the colors of an image in ${containerName}: ${
          error instanceof Error ? error.message : error
        }`,
      );
      return null;
    }
  }

  async delete(fileName: string, containerName: ImageContainer) {
    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: `${containerName}/${fileName}`,
      }),
    );
  }

  /**
   * Best-effort removal of an image that a failed write orphaned. Never
   * throws: the caller is about to rethrow the error that got it here, and a
   * storage failure must not replace that — it becomes a warn instead.
   * Takes a bare blob name or a full URL.
   */
  async deleteUploadedImageQuietly(
    nameOrUrl: string,
    containerName: ImageContainer,
    context: string,
  ) {
    const fileName = nameOrUrl.slice(nameOrUrl.lastIndexOf("/") + 1);
    try {
      await this.delete(fileName, containerName);
    } catch (cleanupError) {
      this.logger.warn(
        `${context} failed and the uploaded image ${fileName} could not be removed: ${
          cleanupError instanceof Error ? cleanupError.message : cleanupError
        }`,
      );
    }
  }

  /**
   * Applies one profile-style image change and answers with what the owning
   * row's image columns should become: the URL and the colors read from it
   * when a new image was uploaded, nulls when the existing one was removed,
   * and `undefined` when the request said nothing about the image and the
   * columns must be left alone.
   *
   * The three-way return is the reason this is one call rather than the caller
   * branching: nulls and `undefined` mean different things to Prisma, and a
   * caller that collapsed them would clear an image every time it saved
   * something else. The colors travel with the URL rather than beside it so a
   * caller cannot store a logo and leave last logo's colors next to it.
   *
   * Removing and uploading in the same request is refused rather than resolved
   * — a request that asks for both has no single obvious outcome.
   */
  async swapImage({
    ownerId,
    currentImageUrl,
    newImage,
    removeImage,
    container,
    conflictMessage,
  }: {
    ownerId: string;
    currentImageUrl: string | null;
    newImage?: Express.Multer.File;
    removeImage?: boolean;
    container: ImageContainer;
    conflictMessage: string;
  }): Promise<ImageChange> {
    if (removeImage && newImage) {
      throw new HttpException({ message: conflictMessage }, 409);
    }

    /* The existing blob goes either way: it is being replaced or removed. */
    if (currentImageUrl && (removeImage || newImage)) {
      const blobName = currentImageUrl.slice(
        currentImageUrl.lastIndexOf("/") + 1,
      );
      await this.delete(blobName, container);
    }

    if (newImage) {
      const { url, colors } = await this.upload(
        this.generateFileNameById(ownerId, newImage),
        newImage.buffer,
        container,
      );
      return { image: url, colors };
    }

    if (removeImage) {
      return { image: null, colors: null };
    }

    return undefined;
  }

  /**
   * Generates a blob name on the format id-random.ext.
   *
   * The random part used to be `(Math.random() + 1).toString(36).substring(7)`,
   * which slices a float's decimal expansion and so produced between 2 and 6
   * base36 characters - measured over 200,000 samples, 9 of them were 2 long,
   * which is 1,296 possibilities. Math.random is xorshift128+ besides, so the
   * sequence is predictable from earlier outputs.
   *
   * That only matters if the containers are public-read, but nothing in the
   * codebase issues a SAS token, and the raw blob URL is what gets persisted
   * and handed to clients - so the blob name may well be the only thing
   * standing between a profile photo and anyone who guesses it. The id prefix
   * is already public through the API.
   *
   * The extension comes from the sniffed content rather than the uploader's
   * Content-Type, so it cannot be anything but jpg or png.
   */
  generateFileNameById(id: string, file: Express.Multer.File) {
    const mimeType = assertIsImage(file.buffer);
    return `${id}-${randomUUID()}.${extensionFor(mimeType)}`;
  }
}
