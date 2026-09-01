import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AccessSessionService } from "../access-session.service";
import { IS_PUBLIC_ROUTE } from "../public.decorator";

@Injectable()
export class SessionRequiredGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accessSession: AccessSessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_ROUTE,
      [context.getHandler(), context.getClass()],
    );

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    request.user = await this.accessSession.userFromRequest(request);

    return true;
  }
}
