import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThreatDetectionService } from "./threat-detection.service";
import { DiscordAlertService } from "./discord-alert.service";

@Module({
  imports: [ConfigModule],
  providers: [ThreatDetectionService, DiscordAlertService],
  exports: [ThreatDetectionService],
})
export class ThreatDetectionModule {}
