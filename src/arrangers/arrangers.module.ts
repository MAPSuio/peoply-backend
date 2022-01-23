import { Module } from "@nestjs/common";
import { ArrangersService } from "./arrangers.service";
import { ArrangersController } from "./arrangers.controller";
import { PrismaModule } from "../prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [ArrangersController],
  providers: [ArrangersService],
  exports: [ArrangersService],
})
export class ArrangersModule {}
