import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AzureMapsController } from "./azure-maps.controller";
import { AzureMapsService } from "./azure-maps.service";
import { AzureStorageService } from "./azure-storage.service";

@Module({
  imports: [ConfigModule],
  controllers: [AzureMapsController],
  providers: [AzureStorageService, AzureMapsService],
  exports: [AzureStorageService],
})
export class AzureModule {}
