import { Injectable, CanActivate, ExecutionContext } from "@nestjs/common";
import { UsersService } from "../../users/services";
import { AuthService } from "../auth.service";

/*
    Verify that the provided userId is the same as the userId in the JWT.

    Use:
        @UseGuards(UserIdVerificationGuard)
        @Get("/something/:userId")
        async method(@Param("userId") userId: string) {
            ...
        }
    @Param is strictly not required as long as the userId is provided in the url params, but is commonly used.
*/
@Injectable()
export class UserIdVerificationGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    //fetch the user id from the request
    const request = context.switchToHttp().getRequest();
    const valid = this.authService.requireValidAccessToken(
      request.cookies.access,
    );
    const validUser = await this.usersService.findById(valid.sub);
    //fetch the user id from the request params
    const requestedUserId = request.params.userId;

    //checks that userId is in the request params
    if (!requestedUserId) {
      throw new Error("Can't find userId in url params");
    }

    //if you are not logged in, you can't access this route
    if (!validUser) {
      return false;
    }
    //check that the user is the same as the one requested
    if (validUser.id === requestedUserId) {
      return true;
    }
    return false;
  }
}
