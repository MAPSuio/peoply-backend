import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  NotFoundException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { OrganizationRole, User } from "../../generated/prisma/client";
import { Observable } from "rxjs";
import { EventsService } from "../../events/events.service";
import { OrganizationsService } from "../../organizations/organizations.service";
import { UsersService } from "../../users/services";
import { AuthService } from "../auth.service";
import { RolesNotFoundException } from "../exceptions/rolesNotFound.exception";

@Injectable()
export class IsArrangerInterceptor implements NestInterceptor {
  constructor(
    private authService: AuthService,
    private usersService: UsersService,
    private reflector: Reflector,
    private readonly organizationsService: OrganizationsService,
    private readonly eventsService: EventsService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const req = context.switchToHttp().getRequest();

    try {
      const valid = this.authService.validateJWT(req.cookies.access);
      const user = await this.usersService.findById(valid.sub);

      if (user) {
        req.user = user;

        try {
          req.isArranger = await this.isArranger(context, req, user);
        } catch (Exception) {
          req.isArranger = false;
        }
      } else {
        req.user = undefined;
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
    const urlId = req.params.urlId;
    const id = req.params.id;
    if (!id && !urlId) {
      throw new NotFoundException(
        "No id or urlId provided. Use urlId as param in function.",
      );
    }

    const event = id
      ? await this.eventsService.findOneWithArrangers(id)
      : await this.eventsService.findOneWithArrangersByUrlId(urlId);

    if (!event) {
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
