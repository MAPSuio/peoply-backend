import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AllergensController } from "./allergens.controller";
import { AllergensService } from "./allergens.service";

@Module({
  imports: [PrismaModule],
  controllers: [AllergensController],
  providers: [AllergensService],
  exports: [AllergensService],
})
export class AllergensModule {}
