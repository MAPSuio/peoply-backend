import { Module } from "@nestjs/common";
import { RegistrationsService } from "./registrations.service";
import { RegistrationsController } from "./registrations.controller";
import { PrismaService } from "src/prisma.service";

@Module({
  controllers: [RegistrationsController],
  providers: [RegistrationsService, PrismaService],
})
export class RegistrationsModule {}
