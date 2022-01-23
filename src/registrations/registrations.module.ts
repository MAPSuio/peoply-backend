import { Module } from "@nestjs/common";
import { RegistrationsController } from "./registrations.controller";
import { PrismaModule } from "../prisma/prisma.module";
import {
  ArrangerRegistrationService,
  CommonRegistrationService,
  UserRegistrationService,
} from "./services";

@Module({
  imports: [PrismaModule],
  controllers: [RegistrationsController],
  providers: [
    UserRegistrationService,
    ArrangerRegistrationService,
    CommonRegistrationService,
  ],
  exports: [UserRegistrationService, ArrangerRegistrationService],
})
export class RegistrationsModule {}
