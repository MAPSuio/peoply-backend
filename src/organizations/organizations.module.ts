import { Module } from "@nestjs/common";
import { OrganizationsService } from "./organizations.service";
import { OrganizationsController } from "./organizations.controller";
import { PrismaModule } from "../prisma/prisma.module";
import { InvitationsModule } from "../invitations/invitations.module";
import { ArrangersModule } from "../arrangers/arrangers.module";

@Module({
  imports: [PrismaModule, ArrangersModule, InvitationsModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
