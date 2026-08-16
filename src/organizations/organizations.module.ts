import { forwardRef, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { OrganizationsService } from "./organizations.service";
import { OrganizationsController } from "./organizations.controller";
import { PrismaModule } from "../prisma/prisma.module";
import { InvitationsModule } from "../invitations/invitations.module";
import { ArrangersModule } from "../arrangers/arrangers.module";
import { AuthModule } from "../auth/auth.module";
import { UsersModule } from "../users/users.module";
import { AzureModule } from "../azure/azure.module";
import { AdministrationModule } from "../administration/administration.module";
import { DiscordModule } from "../discord/discord.module";

@Module({
  imports: [
    ConfigModule,
    DiscordModule,
    PrismaModule,
    ArrangersModule,
    InvitationsModule,
    AuthModule,
    forwardRef(() => UsersModule),
    AzureModule,
    AdministrationModule,
  ],
  controllers: [OrganizationsController],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
