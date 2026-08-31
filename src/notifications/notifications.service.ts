import { Injectable } from "@nestjs/common";
import { EventCoOrganizerInvitationsService } from "../invitations/services/eventCoOrganizerInvitations.service";
import { EventInvitationsService } from "../invitations/services/eventInvitations.service";
import { OrganizationInvitationsService } from "../invitations/services/organizationInvitations.service";
import { pageBoundsOf } from "../util/pagination";
import { PaginationDto } from "../util/pagination.dto";
import {
  PeoplyNotification,
  NotificationType,
} from "./notifications.constants";

function newestFirst(a: PeoplyNotification, b: PeoplyNotification) {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly eventInvitationsService: EventInvitationsService,
    private readonly organizationInvitationsService: OrganizationInvitationsService,
    private readonly coOrganizerInvitationsService: EventCoOrganizerInvitationsService,
  ) {}

  async findAllPendingByUserId(
    userId: string,
    page: PaginationDto = {},
  ): Promise<PeoplyNotification[]> {
    const { skip, take } = pageBoundsOf(page);

    /* Three separately ordered sources merge into one list ordered by
       createdAt, and a requested page can be drawn entirely from any one of
       them. Each source therefore has to offer its own newest skip + take rows
       before the merge: ask for fewer and a row that belongs on the page can
       be missing from every list that was read. */
    const rowsNeededFromEachSource = skip + take;

    const [eventInvitations, organizationInvitations, coOrganizerInvitations] =
      await Promise.all([
        this.eventInvitationsService.findAllPendingInvitationsToUser(
          userId,
          rowsNeededFromEachSource,
        ),
        this.organizationInvitationsService.findAllPendingInvitationsToUser(
          userId,
          rowsNeededFromEachSource,
        ),
        // Addressed to the organizations this user administers rather than to
        // the user, so every admin of an invited organization sees it until
        // one of them answers.
        this.coOrganizerInvitationsService.findAllPendingForUser(
          userId,
          rowsNeededFromEachSource,
        ),
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

    return notifications.sort(newestFirst).slice(skip, skip + take);
  }
}
