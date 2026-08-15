import { Module } from "@nestjs/common";
import { UsersService, FollowService } from "./services";
import { UsersController } from "./users.controller";
import { RegistrationsModule } from "../registrations/registrations.module";
import { PrismaModule } from "../prisma/prisma.module";
import { FavoritesModule } from "../favorites/favorites.module";
import { AzureModule } from "../azure/azure.module";
import { ArrangersModule } from "../arrangers/arrangers.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { AuthModule } from "../auth/auth.module";
import { AdministrationModule } from "../administration/administration.module";

@Module({
  imports: [
    RegistrationsModule,
    PrismaModule,
    FavoritesModule,
    AzureModule,
    ArrangersModule,
    OrganizationsModule,
    NotificationsModule,
    AuthModule,
    AdministrationModule,
  ],
  controllers: [UsersController],
  providers: [UsersService, FollowService],
  exports: [UsersService, FollowService],
})
export class UsersModule {}
