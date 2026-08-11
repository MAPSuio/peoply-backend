import {
  EventCoOrganizerInvitation,
  EventInvitation,
  OrganizationInvitation,
} from "../generated/prisma/client";

export enum NotificationType {
  INVITATION_EVENT = "INVITATION_EVENT",
  INVITATION_ORGANIZATION = "INVITATION_ORGANIZATION",
  INVITATION_EVENT_COORGANIZER = "INVITATION_EVENT_COORGANIZER",
}

export type PeoplyNotification = {
  type: NotificationType;
} & (EventInvitation | OrganizationInvitation | EventCoOrganizerInvitation);
