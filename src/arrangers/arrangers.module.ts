import { Module } from "@nestjs/common";
import { ArrangersController } from "./arrangers.controller";
import { PrismaModule } from "../prisma/prisma.module";
import { ArrangersService, EventArrangersService } from "./services";

@Module({
  imports: [PrismaModule],
  controllers: [ArrangersController],
  providers: [ArrangersService, EventArrangersService],
  exports: [ArrangersService, EventArrangersService],
})
export class ArrangersModule {}
