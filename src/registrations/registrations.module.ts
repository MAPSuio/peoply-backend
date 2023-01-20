import { Module } from "@nestjs/common";
import { AzureModule } from "../azure/azure.module";
import { PrismaModule } from "../prisma/prisma.module";
import {
  ArrangerRegistrationService,
  CommonRegistrationService,
  UserRegistrationService,
} from "./services";

@Module({
  imports: [PrismaModule, AzureModule],
  providers: [
    UserRegistrationService,
    ArrangerRegistrationService,
    CommonRegistrationService,
  ],
  exports: [UserRegistrationService, ArrangerRegistrationService],
})
export class RegistrationsModule {}
