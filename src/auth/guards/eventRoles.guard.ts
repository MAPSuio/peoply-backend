import {
  Injectable,
  CanActivate,
  ExecutionContext,
  NotFoundException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { OrganizationRole } from "@prisma/client";
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
    let event;

    if (!id) {
      if (!urlId) {
        throw new NotFoundException(
          "No id or urlId provided. Use urlId as param in function.",
        );
      } else {
        event = await this.eventsService.findOneWithArrangersByUrlId(urlId);
      }
    } else {
      event = await this.eventsService.findOneWithArrangers(id);
    }

    if (!user || !event) {
      return false;
    }

    //user is arranger of event
    if (event.eventArrangers.find((e) => e.arrangerId === user.arrangerId)) {
      return true;
    }
    // check if user is admin of any organization that is arranger of event
    for (const arranger of event.eventArrangers) {
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
      if (res) return true;
    }
    return false;
  }
}
