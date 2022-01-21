import { Module } from "@nestjs/common";
import { EventsService } from "./events.service";
import { EventsController } from "./events.controller";
import { PrismaService } from "src/prisma.service";
import { RegistrationsModule } from "src/registrations/registrations.module";
import { ArrangersService } from "src/arrangers/arrangers.service";

@Module({
  controllers: [EventsController],
  providers: [EventsService, PrismaService, ArrangersService],
  imports: [RegistrationsModule],
})
export class EventsModule {}
