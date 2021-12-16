import { Module } from "@nestjs/common";
import { UserRegService } from "./services/registrations.service";
import { RegistrationsController } from "./registrations.controller";
import { PrismaService } from "src/prisma.service";

@Module({
  controllers: [RegistrationsController],
  providers: [UserRegService, PrismaService],
})
export class RegistrationsModule {}
