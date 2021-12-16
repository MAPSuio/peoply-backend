import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from "@nestjs/common";

import { UserRegService } from "./services/user.registrations.service";
import { CreateRegistrationDto } from "./dto/create-registration.dto";
import { UserUpdateRegistrationDto } from "./dto/user-update-registration.dto";

// This endpoint is for testing only.
@Controller("registrations")
export class RegistrationsController {
  constructor(private readonly UserRegService: UserRegService) {}

  @Post()
  create(@Body() createRegistrationDto: CreateRegistrationDto) {
    return this.UserRegService.create(createRegistrationDto);
  }

  @Get()
  findAll() {
    const user_id = "a791b4dc-300e-44d9-b856-2d2c61457399"; //hardcoded for testing purposes.
    return this.UserRegService.findAll(user_id);
  }

  @Get(":event_id")
  findOne(@Param("event_id") event_id: number) {
    const user_id = "a791b4dc-300e-44d9-b856-2d2c61457399"; //hardcoded for testing purposes.
    return this.UserRegService.findOne(event_id, user_id);
  }

  @Patch(":event_id")
  update(
    @Param("event_id") event_id: number,
    @Body() UserUpdateRegistrationDto: UserUpdateRegistrationDto,
  ) {
    // TODO: get user_id from auth token when implemented
    let user_id = "5e7ed477-229d-43b2-ae0a-a7694ff44ac0";
    if (UserUpdateRegistrationDto.user_id !== undefined) {
      user_id = UserUpdateRegistrationDto.user_id;
    } else {
      throw new Error("Could not find user_id in the patch body, TESTING ONLY");
    }
    // TODO above when auth token is implemented

    return this.UserRegService.update(
      event_id,
      user_id,
      UserUpdateRegistrationDto,
    );
  }

  @Delete(":event_id")
  remove(@Param("event_id") event_id: number) {
    const user_id = "a791b4dc-300e-44d9-b856-2d2c61457399"; //hardcoded for testing purposes.
    // we should get this from the auth
    return this.UserRegService.remove(event_id, user_id);
  }
}
