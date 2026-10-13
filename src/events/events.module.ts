import { Module } from "@nestjs/common";
import { EventsService } from "./events.service";
import { EventsController } from "./events.controller";
import { ArrangersModule } from "../arrangers/arrangers.module";
import { RegistrationsModule } from "../registrations/registrations.module";
import { PrismaModule } from "../prisma/prisma.module";
import { MailModule } from "../mail/mail.module";
import { StorageModule } from "../storage/storage.module";
import { InvitationsModule } from "../invitations/invitations.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { AuthModule } from "../auth/auth.module";
import { UsersModule } from "../users/users.module";
import { EventAccessModule } from "../event-access/event-access.module";

@Module({
  imports: [
    RegistrationsModule,
    ArrangersModule,
    PrismaModule,
    MailModule,
    StorageModule,
    InvitationsModule,
    OrganizationsModule,
    AuthModule,
    UsersModule,
    EventAccessModule,
  ],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
