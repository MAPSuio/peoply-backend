import { Injectable, CanActivate, ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { OrganizationsService } from "../../organizations/organizations.service";
import { UsersService } from "../../users/users.service";
import { AuthService } from "../auth.service";

/*
  To use this guard, one must also specify which org roles that can access, e.g. ADMIN. This is done by adding @Roles(OrganizationRole.ADMIN) to the controller method. This example uses the ADMIN role.
*/
@Injectable()
export class OrganizationRolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private readonly organizationsService: OrganizationsService,
    private authService: AuthService,
    private usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const roles = this.reflector.get<string[]>("roles", context.getHandler());
    if (!roles) {
      return false;
    }
    const request = context.switchToHttp().getRequest();
    const valid = this.authService.validateJWT(request.cookies.access);
    const user = await this.usersService.findById(valid.sub);
    const arrangerId = request.body.arrangerId;

    // is the arranger an organization?
    const org = await this.organizationsService.findByArrangerId(arrangerId);

    if (!org) {
      return false;
    }

    for (const role of org.organizationRoles) {
      if (role.userId === user?.id && roles.includes(role.role)) {
        return true;
      }
    }
    return false;
  }
}
