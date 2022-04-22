import { Injectable } from "@nestjs/common";
import { EventInvitationsService } from "../invitations/services/eventInvitations.service";
import { OrganizationInvitationsService } from "../invitations/services/organizationInvitations.service";
import { NotificationType } from "./notifications.constants";

@Injectable()
export class NotificationsService {
  constructor(
    private readonly eventInvitationsService: EventInvitationsService,
    private readonly organizationInvitationsService: OrganizationInvitationsService,
  ) {}

  async findAllPendingByUserId(userId: string) {
    const eventInvitations =
      this.eventInvitationsService.findAllPendingInvitationsToUser(userId);

    const organizationInvitations =
      this.organizationInvitationsService.findAllPendingInvitationsToUser(
        userId,
      );

    const eventNotifications = (await eventInvitations).map((invitation) => {
      return {
        type: NotificationType.INVITATION_EVENT,
        ...invitation,
      };
    });
    const organizationNotifications = (await organizationInvitations).map(
      (invitation) => {
        return {
          type: NotificationType.INVITATION_ORGANIZATION,
          ...invitation,
        };
      },
    );

    const notifications = [...eventNotifications, ...organizationNotifications];

    /* sort notifications by createdAt */
    return notifications.sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }
}
