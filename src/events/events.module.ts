import { Module } from "@nestjs/common";
import { EventsService } from "./events.service";
import { EventsController } from "./events.controller";
import { PrismaService } from "src/prisma.service";
import { ArrangersService } from "src/arrangers/arrangers.service";

@Module({
  controllers: [EventsController],
  providers: [EventsService, PrismaService, ArrangersService],
})
export class EventsModule {}
