import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { RegistrationsModule } from "../registrations/registrations.module";
import { EventInvitationsService } from "./services/eventInvitations.service";
import { OrganizationInvitationsService } from "./services/organizationInvitations.service";

@Module({
  imports: [PrismaModule, RegistrationsModule],
  controllers: [],
  providers: [EventInvitationsService, OrganizationInvitationsService],
  exports: [EventInvitationsService, OrganizationInvitationsService],
})
export class InvitationsModule {}
