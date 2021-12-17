import { Module } from "@nestjs/common";
import { UserRegService } from "./services/user.registrations.service";
import { RegistrationsController } from "./registrations.controller";
import { PrismaService } from "src/prisma.service";
import { ArrangerRegService } from "./services/arranger.registrations.service";

@Module({
  controllers: [RegistrationsController],
  providers: [UserRegService, ArrangerRegService, PrismaService],
})
export class RegistrationsModule {}
