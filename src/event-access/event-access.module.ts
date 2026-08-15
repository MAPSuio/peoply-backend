import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { EventAccessService } from "./event-access.service";

@Module({
  imports: [PrismaModule],
  providers: [EventAccessService],
  exports: [EventAccessService],
})
export class EventAccessModule {}
