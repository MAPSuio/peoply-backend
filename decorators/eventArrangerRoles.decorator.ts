import { SetMetadata } from "@nestjs/common";
import { EventArrangerRole } from "../src/generated/prisma/client";

export const EVENT_ARRANGER_ROLES_KEY = "eventArrangerRoles";

/**
 * Which `EventArranger.role` may reach the route, for routes already behind
 * `EventRolesGuard`.
 *
 * Absent means both — a co-organizer may run the event day to day. Put it on
 * the routes that are the event owner's alone, i.e. the ones a co-organizer
 * could use to take the event away from whoever created it.
 *
 * This is orthogonal to `@OrganizationRoles`, which says which role you need
 * *inside an arranging organization*. This one says what that organization is
 * to the event.
 */
export const EventArrangerRoles = (...roles: EventArrangerRole[]) =>
  SetMetadata(EVENT_ARRANGER_ROLES_KEY, roles);
