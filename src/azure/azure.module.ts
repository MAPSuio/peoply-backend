import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AzureStorageService } from "./azure-storage.service";

@Module({
  providers: [AzureStorageService, ConfigService],
  exports: [AzureStorageService],
})
export class AzureModule {}
