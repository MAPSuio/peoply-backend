import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ImageStorageService } from "./image-storage.service";

@Module({
  imports: [ConfigModule],
  providers: [ImageStorageService],
  exports: [ImageStorageService],
})
export class StorageModule {}
