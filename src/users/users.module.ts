import { Module } from "@nestjs/common";
import { UsersService } from "./users.service";
import { UsersController } from "./users.controller";
import { RegistrationsModule } from "../registrations/registrations.module";
import { PrismaModule } from "../prisma/prisma.module";

@Module({
  imports: [RegistrationsModule, PrismaModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
