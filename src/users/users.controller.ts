import {
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { AccessGuard } from "src/auth/guards/access.guard";
import { UsersService } from "./users.service";
// import { UpdateUserDto } from "./dto/update-user.dto";
import { UserRegistrationService } from "src/registrations/services/user.registrations.service";
import { SearchUserRegistrationDto } from "src/registrations/dto/searchUserRegistrationDto";
import { UserUpdateRegistrationDto } from "src/registrations/dto/user-update-registration.dto";
import { Console } from "console";

@Controller("users")
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly userRegistrationService: UserRegistrationService,
  ) {}

  @UseGuards(AccessGuard)
  @Get("me")
  async me(@Req() req: any) {
    return req.user;
  }

  @UseGuards(AccessGuard)
  @Get(":id/registrations")
  async getRegistrations(
    @Req() req: any,
    @Query() query: SearchUserRegistrationDto,
    @Param("id") id: string,
  ) {
    if (id === req.user.user_id) {
      return this.userRegistrationService.findAll(query, id);
    } else {
      throw new UnauthorizedException(
        "You are not authorized register this user to this event",
      );
    }
  }

  @UseGuards(AccessGuard)
  @Patch(":id/registrations")
  async updateRegistration(
    @Req() req: any,
    @Param("id") id: string,
    @Query() dto: UserUpdateRegistrationDto,
  ) {
    console.log("id is ", id, " ? ", req.user.user_id);

    if (id === req.user.user_id) {
      return this.userRegistrationService.update(id, dto);
    } else {
      throw new UnauthorizedException(
        "You are not authorized to manipulate the registration for this user",
      );
    }
  }
}
