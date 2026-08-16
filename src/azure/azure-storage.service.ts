import {
  HttpException,
  Injectable,
  Logger,
  OnModuleInit,
} from "@nestjs/common";
import {
  BlobServiceClient,
  StorageSharedKeyCredential,
} from "@azure/storage-blob";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { AzureStorageContainer } from "./azure-storage.constants";
import { assertIsImage, extensionFor } from "./image-upload";

@Injectable()
export class AzureStorageService
  extends BlobServiceClient
  implements OnModuleInit
{
  private readonly logger = new Logger(AzureStorageService.name);
  private readonly skipInit: boolean;

  constructor(configService: ConfigService) {
    super(
      `https://${configService.get<string>(
        "AZURE_STORAGE_ACCOUNT",
      )}.blob.core.windows.net`,
      new StorageSharedKeyCredential(
        `${configService.get<string>("AZURE_STORAGE_ACCOUNT")}`,
        `${configService.get<string>("AZURE_STORAGE_KEY")}`,
      ),
    );

    const skipInit = configService.get<boolean | string>(
      "AZURE_STORAGE_SKIP_INIT",
    );
    this.skipInit = skipInit === true || skipInit === "true";
  }

  async onModuleInit() {
    if (this.skipInit) {
      return;
    }

    await this.createContainersIfNotExists();
  }

  private async createContainersIfNotExists() {
    // ORGANIZATION_IMAGES was missing, so on a fresh storage account an
    // organization image upload threw against a container that did not exist.
    for (const containerName of Object.values(AzureStorageContainer)) {
      const container = this.getContainerClient(containerName);
      if (!(await container.exists())) {
        await container.create();
      }
    }
  }

  async upload(
    fileName: string,
    file: Buffer,
    containerName: AzureStorageContainer,
  ) {
    const container = this.getContainerClient(containerName);
    const blockBlobClient = container.getBlockBlobClient(fileName);
    await blockBlobClient.upload(file, file.length);
    return blockBlobClient.url;
  }

  async delete(fileName: string, containerName: AzureStorageContainer) {
    const container = this.getContainerClient(containerName);
    const blockBlobClient = container.getBlockBlobClient(fileName);
    await blockBlobClient.delete();
  }

  /**
   * Best-effort removal of an image that a failed write orphaned. Never
   * throws: the caller is about to rethrow the error that got it here, and a
   * storage failure must not replace that — it becomes a warn instead.
   * Takes a bare blob name or a full URL.
   */
  async deleteUploadedImageQuietly(
    nameOrUrl: string,
    containerName: AzureStorageContainer,
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

  async replace(
    fileName: string,
    file: Buffer,
    containerName: AzureStorageContainer,
  ) {
    const container = this.getContainerClient(containerName);
    const blockBlobClient = container.getBlockBlobClient(fileName);
    await blockBlobClient.delete();
    await blockBlobClient.upload(file, file.length);
    return blockBlobClient.url;
  }

  /**
   * Applies one profile-style image change and answers with what the owning
   * row's `image` column should become: a URL when a new image was uploaded,
   * `null` when the existing one was removed, and `undefined` when the request
   * said nothing about the image and the column must be left alone.
   *
   * The three-way return is the reason this is one call rather than the caller
   * branching: `null` and `undefined` mean different things to Prisma, and a
   * caller that collapsed them would clear an image every time it saved
   * something else.
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
    container: AzureStorageContainer;
    conflictMessage: string;
  }): Promise<string | null | undefined> {
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
      return await this.upload(
        this.generateFileNameById(ownerId, newImage),
        newImage.buffer,
        container,
      );
    }

    if (removeImage) {
      return null;
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
