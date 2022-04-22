import { Module } from "@nestjs/common";
import { InvitationsModule } from "../invitations/invitations.module";
import { NotificationsService } from "./notifications.service";

@Module({
  imports: [InvitationsModule],
  controllers: [],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
