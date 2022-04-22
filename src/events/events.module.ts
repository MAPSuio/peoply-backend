import { Module } from "@nestjs/common";
import { EventsService } from "./events.service";
import { EventsController } from "./events.controller";
import { ArrangersModule } from "../arrangers/arrangers.module";
import { RegistrationsModule } from "../registrations/registrations.module";
import { PrismaModule } from "../prisma/prisma.module";
import { AzureModule } from "../azure/azure.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { AuthModule } from "../auth/auth.module";
import { UsersModule } from "../users/users.module";

@Module({
  imports: [
    RegistrationsModule,
    ArrangersModule,
    PrismaModule,
    AzureModule,
    OrganizationsModule,
    AuthModule,
    UsersModule,
  ],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
