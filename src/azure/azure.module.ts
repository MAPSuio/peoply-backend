import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AzureCommunicationService } from "./azure-communication.service";

@Module({
  imports: [ConfigModule],
  providers: [AzureCommunicationService],
  exports: [AzureCommunicationService],
})
export class AzureModule {}
