import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { UsersService } from "../../users/users.service";
import { AuthService } from "../auth.service";

@Injectable()
export class AuthenticatedInterceptor implements NestInterceptor {
  constructor(
    private authService: AuthService,
    private usersService: UsersService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const req = context.switchToHttp().getRequest();

    try {
      const valid = this.authService.validateJWT(req.cookies.access);
      const user = await this.usersService.findById(valid.sub);
      req.user = user;
    } catch (Exception) {
      req.user = undefined;
    }

    return next.handle();
  }
}
