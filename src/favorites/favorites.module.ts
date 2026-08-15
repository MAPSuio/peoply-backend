import { Module } from "@nestjs/common";
import { FavoritesService } from "./favorites.service";
import { PrismaModule } from "../prisma/prisma.module";
import { EventAccessModule } from "../event-access/event-access.module";

@Module({
  imports: [PrismaModule, EventAccessModule],
  providers: [FavoritesService],
  exports: [FavoritesService],
})
export class FavoritesModule {}
