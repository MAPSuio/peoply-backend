import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import {
  ArrangerRegistrationService,
  CommonRegistrationService,
  UserRegistrationService,
} from "./services";

@Module({
  imports: [PrismaModule],
  providers: [
    UserRegistrationService,
    ArrangerRegistrationService,
    CommonRegistrationService,
  ],
  exports: [UserRegistrationService, ArrangerRegistrationService],
})
export class RegistrationsModule {}
