import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AdministrationService } from "./administration.service";

@Module({
  imports: [PrismaModule],
  providers: [AdministrationService],
  exports: [AdministrationService],
})
export class AdministrationModule {}
