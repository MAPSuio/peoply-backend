import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { RegistrationsModule } from "../registrations/registrations.module";
import { EventCoOrganizerInvitationsService } from "./services/eventCoOrganizerInvitations.service";
import { EventInvitationsService } from "./services/eventInvitations.service";
import { OrganizationInvitationsService } from "./services/organizationInvitations.service";

@Module({
  imports: [PrismaModule, RegistrationsModule],
  controllers: [],
  providers: [
    EventInvitationsService,
    OrganizationInvitationsService,
    EventCoOrganizerInvitationsService,
  ],
  exports: [
    EventInvitationsService,
    OrganizationInvitationsService,
    EventCoOrganizerInvitationsService,
  ],
})
export class InvitationsModule {}
