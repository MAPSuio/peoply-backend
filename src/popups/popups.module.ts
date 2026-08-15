import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdministrationModule } from "../administration/administration.module";
import { PrismaModule } from "../prisma/prisma.module";
import { PopupsController } from "./popups.controller";
import { PopupsService } from "./popups.service";

@Module({
  imports: [AdministrationModule, AuthModule, PrismaModule],
  controllers: [PopupsController],
  providers: [PopupsService],
})
export class PopupsModule {}
