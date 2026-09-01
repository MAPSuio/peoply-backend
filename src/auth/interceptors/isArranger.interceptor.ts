import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  EventArrangerRole,
  OrganizationRole,
  User,
} from "../../generated/prisma/client";
import { Observable } from "rxjs";
import { EVENT_ARRANGER_ROLES_KEY } from "../../../decorators/eventArrangerRoles.decorator";
import { EventAccessService } from "../../event-access/event-access.service";
import { AccessSessionService } from "../access-session.service";
import { RolesNotFoundException } from "../exceptions/rolesNotFound.exception";

@Injectable()
export class IsArrangerInterceptor implements NestInterceptor {
  constructor(
    private readonly accessSession: AccessSessionService,
    private reflector: Reflector,
    private readonly eventAccess: EventAccessService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const req = context.switchToHttp().getRequest();

    try {
      const user = await this.accessSession.userFromRequest(req);

      req.user = user;

      try {
        req.isArranger = await this.isArranger(context, req, user);
      } catch (Exception) {
        req.isArranger = false;
      }
    } catch (Exception) {
      req.user = undefined;
      req.isArranger = false;
    }

    return next.handle();
  }

  private async isArranger(
    context: ExecutionContext,
    req: any,
    user: User,
  ): Promise<boolean> {
    const roles = this.reflector.get<OrganizationRole[]>(
      "roles",
      context.getHandler(),
    );
    if (!roles) {
      throw new RolesNotFoundException();
    }

    /* Same rule as EventRolesGuard, resolved by the same module. Before the
       extraction this interceptor carried its own copy of the algorithm and
       never learned to read @EventArrangerRoles, so the two could diverge. */
    const allowedArrangerRoles = this.reflector.get<EventArrangerRole[]>(
      EVENT_ARRANGER_ROLES_KEY,
      context.getHandler(),
    );

    const role = await this.eventAccess.arrangerRoleFor(
      user,
      { id: req.params.id, urlId: req.params.urlId },
      { allowedArrangerRoles, orgRoles: roles },
    );

    return role !== null;
  }
}
