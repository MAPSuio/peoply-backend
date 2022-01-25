import { Module } from "@nestjs/common";
import { EventsService } from "./events.service";
import { EventsController } from "./events.controller";
import { ArrangersModule } from "../arrangers/arrangers.module";
import { RegistrationsModule } from "../registrations/registrations.module";
import { PrismaModule } from "../prisma/prisma.module";
import { AzureModule } from "../azure/azure.module";

@Module({
  imports: [RegistrationsModule, ArrangersModule, PrismaModule, AzureModule],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
