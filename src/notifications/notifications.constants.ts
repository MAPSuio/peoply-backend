import {
  EventInvitation,
  OrganizationInvitation,
} from "../generated/prisma/client";

export enum NotificationType {
  INVITATION_EVENT = "INVITATION_EVENT",
  INVITATION_ORGANIZATION = "INVITATION_ORGANIZATION",
}

export type PeoplyNotification = {
  type: NotificationType;
} & (EventInvitation | OrganizationInvitation);
