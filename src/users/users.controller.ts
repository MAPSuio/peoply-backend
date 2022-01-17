import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { AccessGuard } from "src/auth/guards/access.guard";
import { UsersService } from "./users.service";
// import { UpdateUserDto } from "./dto/update-user.dto";
import { ArrangerRegistrationService } from "src/registrations/services/arranger.registrations.service";

@Controller("users")
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly arrangerRegistrationService: ArrangerRegistrationService,
  ) {}

  @Get("/events/:id")
  async findAllRegisteredForEvent(@Param("id") id: number) {
    return this.arrangerRegistrationService.findAll(id);
  }

  @UseGuards(AccessGuard)
  @Get("me")
  async me(@Req() req: any) {
    return req.user;
  }
}
