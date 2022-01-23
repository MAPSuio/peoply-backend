import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { AuthenticatedGuard } from "../auth/guards";
import {
  CreateRegistrationDto,
  DeleteRegistrationDto,
  SearchUserRegistrationDto,
  UserUpdateRegistrationDto,
} from "../registrations/dto";
import { UserRegistrationService } from "../registrations/services";

@Controller("users")
export class UsersController {
  constructor(
    private readonly userRegistrationService: UserRegistrationService,
  ) {}

  @UseGuards(AuthenticatedGuard)
  @Get("me")
  async me(@Req() req: any) {
    return req.user;
  }

  @UseGuards(AuthenticatedGuard)
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
        "You are not authorized to see this users registrations",
      );
    }
  }

  @UseGuards(AuthenticatedGuard)
  @Patch(":id/registrations")
  async updateRegistration(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: UserUpdateRegistrationDto,
  ) {
    if (id === req.user.user_id) {
      // TODO check if the event exists
      return this.userRegistrationService.update(id, dto);
    } else {
      throw new UnauthorizedException(
        "You are not authorized to manipulate the registration for this user",
      );
    }
  }

  @UseGuards(AuthenticatedGuard)
  @Post(":id/registrations")
  async createRegistration(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: CreateRegistrationDto,
  ) {
    if (id === req.user.user_id) {
      // TODO check if the event exists
      return this.userRegistrationService.create(id, dto);
    } else {
      throw new UnauthorizedException(
        "You are not authorized to register this user",
      );
    }
  }

  @UseGuards(AuthenticatedGuard)
  @Delete(":id/registrations")
  async deleteRegistration(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: DeleteRegistrationDto,
  ) {
    if (id === req.user.user_id) {
      // TODO check if the event exists
      return this.userRegistrationService.remove(dto.event_id, id);
    } else {
      throw new UnauthorizedException(
        "You are not authorized to delete the registration for this user",
      );
    }
  }
}
