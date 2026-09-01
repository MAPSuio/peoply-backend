import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { AccessSessionService } from "../access-session.service";

/**
 * Restricts access to users whose email is listed in the
 * MODERATOR_EMAILS environment variable (comma-separated).
 * Must be used after AuthenticatedGuard.
 */
@Injectable()
export class ModeratorGuard implements CanActivate {
  constructor(private readonly accessSession: AccessSessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const allowed = (process.env.MODERATOR_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    if (allowed.length === 0) {
      throw new ForbiddenException("Moderation access is not configured");
    }

    const request = context.switchToHttp().getRequest();
    const user = await this.accessSession.userFromRequest(request);

    if (!allowed.includes(user.email.toLowerCase())) {
      throw new ForbiddenException("Insufficient privileges");
    }

    return true;
  }
}
