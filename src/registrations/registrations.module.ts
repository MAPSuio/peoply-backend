import { Module } from "@nestjs/common";
import { UserRegistrationService } from "./services/user.registrations.service";
import { RegistrationsController } from "./registrations.controller";
import { PrismaService } from "src/prisma.service";
import { ArrangerRegistrationService } from "./services/arranger.registrations.service";

@Module({
  controllers: [RegistrationsController],
  providers: [
    UserRegistrationService,
    ArrangerRegistrationService,
    PrismaService,
  ],
  exports: [UserRegistrationService, ArrangerRegistrationService],
})
export class RegistrationsModule {}
