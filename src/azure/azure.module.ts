import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AzureCommunicationService } from "./azure-communication.service";
import { AzureStorageService } from "./azure-storage.service";

@Module({
  imports: [ConfigModule],
  providers: [AzureStorageService, AzureCommunicationService],
  exports: [AzureStorageService, AzureCommunicationService],
})
export class AzureModule {}
