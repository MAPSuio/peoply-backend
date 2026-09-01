import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { AccessSessionService } from "../access-session.service";

@Injectable()
export class AuthenticatedInterceptor implements NestInterceptor {
  constructor(private readonly accessSession: AccessSessionService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const req = context.switchToHttp().getRequest();

    try {
      req.user = await this.accessSession.userFromRequest(req);
    } catch (Exception) {
      req.user = undefined;
    }

    return next.handle();
  }
}
