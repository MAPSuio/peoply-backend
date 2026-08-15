import { Injectable, CanActivate, ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  EventArrangerRole,
  OrganizationRole,
} from "../../generated/prisma/client";
import { EVENT_ARRANGER_ROLES_KEY } from "../../../decorators/eventArrangerRoles.decorator";
import { EventAccessService } from "../../event-access/event-access.service";
import { UsersService } from "../../users/services";
import { AuthService } from "../auth.service";
import { RolesNotFoundException } from "../exceptions/rolesNotFound.exception";

/*
    To use this guard with orgs, one must also specify which org roles that can access, e.g. ADMIN. This is done by adding the decorator @OrganizationRoles(OrganizationRole.ADMIN) to the controller method, before the @UseGuards(EventRolesGuard). This example uses the ADMIN role, but other or more roles can be added.
    Requires urlId to be in the request params.
  */
@Injectable()
export class EventRolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly eventAccess: EventAccessService,
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
    if (!user) {
      return false;
    }

    const allowedArrangerRoles = this.reflector.get<EventArrangerRole[]>(
      EVENT_ARRANGER_ROLES_KEY,
      context.getHandler(),
    );

    const role = await this.eventAccess.arrangerRoleFor(
      user,
      { id: request.params.id, urlId: request.params.urlId },
      { allowedArrangerRoles, orgRoles: roles },
    );

    if (role === null) {
      return false;
    }

    /* Read downstream to decide whether the co-organizer list may be
       edited, which cannot be expressed as a whole-route rule. */
    request.eventArrangerRole = role;
    return true;
  }
}
