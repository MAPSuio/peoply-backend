import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AzureCommunicationService } from "./azure-communication.service";
import { AzureMapsController } from "./azure-maps.controller";
import { AzureMapsService } from "./azure-maps.service";
import { AzureStorageService } from "./azure-storage.service";

@Module({
  imports: [ConfigModule],
  controllers: [AzureMapsController],
  providers: [AzureStorageService, AzureMapsService, AzureCommunicationService],
  exports: [AzureStorageService, AzureMapsService, AzureCommunicationService],
})
export class AzureModule {}
