import {
  Injectable,
  CanActivate,
  ExecutionContext,
  NotFoundException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  EventArrangerRole,
  OrganizationRole,
} from "../../generated/prisma/client";
import { EVENT_ARRANGER_ROLES_KEY } from "../../../decorators/eventArrangerRoles.decorator";
import { EventsService } from "../../events/events.service";
import { OrganizationsService } from "../../organizations/organizations.service";
import { PrismaService } from "../../prisma/prisma.service";
import { UsersService } from "../../users/services";
import { AuthService } from "../auth.service";
import { RolesNotFoundException } from "../exceptions/rolesNotFound.exception";

/*
    To use this guard with orgs, one must also specify which org roles that can access, e.g. ADMIN. This is done by adding the decorator @OrganizationRoles(OrganizationRole.ADMIN) to the controller method, before the @UseGuards(EventRolesGuard). This example uses the ADMIN role, but other or more roles can be added.
    Requires urlId to be in the request params.
  */
const ALL_EVENT_ARRANGER_ROLES = [
  EventArrangerRole.ADMIN,
  EventArrangerRole.COLLABORATOR,
];

@Injectable()
export class EventRolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private readonly organizationsService: OrganizationsService,
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const roles = this.reflector.get<OrganizationRole[]>(
      "roles",
      context.getHandler(),
    );
    if (!roles) {
      throw new RolesNotFoundException();
    }
    const request = context.switchToHttp().getRequest();
    const valid = this.authService.validateJWT(request.cookies.access);
    const user = await this.usersService.findById(valid.sub);
    const urlId = request.params.urlId;
    const id = request.params.id;
    if (!id && !urlId) {
      throw new NotFoundException(
        "No id or urlId provided. Use urlId as param in function.",
      );
    }

    const event = id
      ? await this.eventsService.findOneWithArrangers(id)
      : await this.eventsService.findOneWithArrangersByUrlId(urlId);

    if (!user || !event) {
      return false;
    }

    /* Which kind of arranger the route is open to. `EventArranger.role` was
       never read anywhere for authorization, so a COLLABORATOR added as
       co-organizer had exactly the powers of the event's own arranger - it
       could delete the event outright, or drop every other co-organizer.
       Absent means both roles, which is the case for most routes. */
    const allowedArrangerRoles =
      this.reflector.get<EventArrangerRole[]>(
        EVENT_ARRANGER_ROLES_KEY,
        context.getHandler(),
      ) ?? ALL_EVENT_ARRANGER_ROLES;

    //user is arranger of event
    const directArranger = event.eventArrangers.find(
      (e) => e.arrangerId === user.arrangerId,
    );
    if (directArranger) {
      if (allowedArrangerRoles.includes(directArranger.role)) {
        /* Read downstream to decide whether the co-organizer list may be
           edited, which cannot be expressed as a whole-route rule. */
        request.eventArrangerRole = directArranger.role;
        return true;
      }
      /* Fall through rather than returning: the same person may also be an
         admin of an organization that arranges this event with a higher role. */
    }

    // check if user is admin of any organization that is arranger of event
    for (const arranger of event.eventArrangers) {
      if (!allowedArrangerRoles.includes(arranger.role)) {
        continue;
      }

      const org = await this.organizationsService.findByArrangerId(
        arranger.arrangerId,
      );

      if (!org) {
        // this arranger is an individual, not an org — skip
        continue;
      }
      // is the user a <role> of this organization?
      const res = await this.organizationsService.checkUserRole(
        user.id,
        org.id,
        roles,
      );
      if (res) {
        request.eventArrangerRole = arranger.role;
        return true;
      }
    }
    return false;
  }
}
