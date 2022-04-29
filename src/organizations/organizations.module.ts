import { forwardRef, Module } from "@nestjs/common";
import { OrganizationsService } from "./organizations.service";
import { OrganizationsController } from "./organizations.controller";
import { PrismaModule } from "../prisma/prisma.module";
import { InvitationsModule } from "../invitations/invitations.module";
import { ArrangersModule } from "../arrangers/arrangers.module";
import { AuthModule } from "../auth/auth.module";
import { UsersModule } from "../users/users.module";

@Module({
  imports: [
    PrismaModule,
    ArrangersModule,
    InvitationsModule,
    forwardRef(() => AuthModule),
    forwardRef(() => UsersModule),
  ],
  controllers: [OrganizationsController],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
