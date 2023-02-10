import { Module } from "@nestjs/common";
import { ModerationService } from "./moderation.service";
import { ModerationController } from "./moderation.controller";
import { PrismaModule } from "../prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [ModerationController],
  providers: [ModerationService],
  exports: [ModerationService],
})
export class ModerationModule {}
