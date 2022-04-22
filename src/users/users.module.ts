import { Module } from "@nestjs/common";
import { UsersService } from "./users.service";
import { UsersController } from "./users.controller";
import { RegistrationsModule } from "../registrations/registrations.module";
import { PrismaModule } from "../prisma/prisma.module";
import { FavoritesModule } from "../favorites/favorites.module";
import { AzureModule } from "../azure/azure.module";
import { ArrangersModule } from "../arrangers/arrangers.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [
    RegistrationsModule,
    PrismaModule,
    FavoritesModule,
    AzureModule,
    ArrangersModule,
    OrganizationsModule,
    NotificationsModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
