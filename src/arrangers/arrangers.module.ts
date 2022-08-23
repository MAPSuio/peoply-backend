import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { ArrangersService, EventArrangersService } from "./services";

@Module({
  imports: [PrismaModule],
  providers: [ArrangersService, EventArrangersService],
  exports: [ArrangersService, EventArrangersService],
})
export class ArrangersModule {}
