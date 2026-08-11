import { Injectable } from "@nestjs/common";
import { EventCoOrganizerInvitationsService } from "../invitations/services/eventCoOrganizerInvitations.service";
import { EventInvitationsService } from "../invitations/services/eventInvitations.service";
import { OrganizationInvitationsService } from "../invitations/services/organizationInvitations.service";
import {
  PeoplyNotification,
  NotificationType,
} from "./notifications.constants";

@Injectable()
export class NotificationsService {
  constructor(
    private readonly eventInvitationsService: EventInvitationsService,
    private readonly organizationInvitationsService: OrganizationInvitationsService,
    private readonly coOrganizerInvitationsService: EventCoOrganizerInvitationsService,
  ) {}

  async findAllPendingByUserId(userId: string): Promise<PeoplyNotification[]> {
    const [eventInvitations, organizationInvitations, coOrganizerInvitations] =
      await Promise.all([
        this.eventInvitationsService.findAllPendingInvitationsToUser(userId),
        this.organizationInvitationsService.findAllPendingInvitationsToUser(
          userId,
        ),
        // Addressed to the organizations this user administers rather than to
        // the user, so every admin of an invited organization sees it until
        // one of them answers.
        this.coOrganizerInvitationsService.findAllPendingForUser(userId),
      ]);

    const notifications: PeoplyNotification[] = [
      ...eventInvitations.map((invitation) => ({
        type: NotificationType.INVITATION_EVENT,
        ...invitation,
      })),
      ...organizationInvitations.map((invitation) => ({
        type: NotificationType.INVITATION_ORGANIZATION,
        ...invitation,
      })),
      ...coOrganizerInvitations.map((invitation) => ({
        type: NotificationType.INVITATION_EVENT_COORGANIZER,
        ...invitation,
      })),
    ];

    /* sort notifications by createdAt */
    return notifications.sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }
}
