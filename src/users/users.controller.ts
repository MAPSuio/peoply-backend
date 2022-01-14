import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { AccessGuard } from "src/auth/guards/access.guard";
import { UsersService } from "./users.service";

@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(AccessGuard)
  @Get("me")
  async me(@Req() req: any) {
    return req.user;
  }
}
