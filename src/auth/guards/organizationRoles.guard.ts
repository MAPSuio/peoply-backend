import { Injectable, CanActivate, ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { OrganizationRole } from "@prisma/client";
import { OrganizationsService } from "../../organizations/organizations.service";
import { UsersService } from "../../users/services";
import { AuthService } from "../auth.service";
import { RolesNotFoundException } from "../exceptions/rolesNotFound.exception";

/*
  To use this guard, one must also specify which org roles that can access, e.g. ADMIN. This is done by adding the decorator @OrganizationRoles(OrganizationRole.ADMIN) to the controller method, before the @UseGuards(OrganizationRolesGuard). This example uses the ADMIN role, but other or more roles can be added.
  Requires orgId to be in the request params.
*/
@Injectable()
export class OrganizationRolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private readonly organizationsService: OrganizationsService,
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
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
    const orgId = request.params.orgId;

    if (!user) {
      return false;
    }
    // is the user a <role> of the organization?
    const res = await this.organizationsService.checkUserRole(
      user.id,
      orgId,
      roles,
    );
    return res;
  }
}
