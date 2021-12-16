import { PrismaService } from "src/prisma.service";
import { Module } from "@nestjs/common";
import { ArrangersService } from "./arrangers.service";
import { ArrangersController } from "./arrangers.controller";

@Module({
  controllers: [ArrangersController],
  providers: [ArrangersService, PrismaService],
})
export class ArrangersModule {}
