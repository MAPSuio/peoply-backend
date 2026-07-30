import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { AuthService } from "../auth.service";
import { UsersService } from "../../users/services";

/**
 * Restricts access to users whose email is listed in the
 * MODERATOR_EMAILS environment variable (comma-separated).
 * Must be used after AuthenticatedGuard.
 */
@Injectable()
export class ModeratorGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const allowed = (process.env.MODERATOR_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    if (allowed.length === 0) {
      throw new ForbiddenException("Moderation access is not configured");
    }

    const request = context.switchToHttp().getRequest();
    const valid = this.authService.requireValidAccessToken(
      request.cookies.access,
    );
    const user = await this.usersService.findById(valid.sub);

    if (!user || !allowed.includes(user.email.toLowerCase())) {
      throw new ForbiddenException("Insufficient privileges");
    }

    return true;
  }
}
