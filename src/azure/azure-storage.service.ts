import { Injectable, OnModuleInit } from "@nestjs/common";
import {
  BlobServiceClient,
  StorageSharedKeyCredential,
} from "@azure/storage-blob";
import { ConfigService } from "@nestjs/config";
import { AzureStorageContainer } from "./azure-storage.constants";

@Injectable()
export class AzureStorageService
  extends BlobServiceClient
  implements OnModuleInit
{
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
  }

  async onModuleInit() {
    await this.createContainersIfNotExists();
  }

  private async createContainersIfNotExists() {
    for (const containerName of [
      AzureStorageContainer.PROFILE_IMAGES,
      AzureStorageContainer.EVENT_IMAGES,
    ]) {
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

  generateFileNameById(id: string, file: Express.Multer.File) {
    return `${id}.${file.mimetype.split("/")[1]}`;
  }
}
