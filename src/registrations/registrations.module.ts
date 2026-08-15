import { Module } from "@nestjs/common";
import { AzureModule } from "../azure/azure.module";
import { EventAccessModule } from "../event-access/event-access.module";
import { PrismaModule } from "../prisma/prisma.module";
import {
  ArrangerRegistrationService,
  CommonRegistrationService,
  UserRegistrationService,
} from "./services";

@Module({
  imports: [PrismaModule, AzureModule, EventAccessModule],
  providers: [
    UserRegistrationService,
    ArrangerRegistrationService,
    CommonRegistrationService,
  ],
  exports: [UserRegistrationService, ArrangerRegistrationService],
})
export class RegistrationsModule {}
