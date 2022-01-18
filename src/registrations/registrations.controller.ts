import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from "@nestjs/common";

import { UserRegistrationService } from "./services/user.registrations.service";
import { ArrangerRegistrationService } from "./services/arranger.registrations.service";
import { CreateRegistrationDto } from "./dto/create-registration.dto";
import { UserUpdateRegistrationDto } from "./dto/user-update-registration.dto";
import { ArrangerUpdateRegistrationDto } from "./dto/arranger-update-registration.dto";

// This endpoint is for testing only.
@Controller("registrations")
export class RegistrationsController {
  constructor(
    private readonly userRegistrationService: UserRegistrationService,
    private readonly arrangerRegistrationService: ArrangerRegistrationService,
  ) {}

  @Post()
  create(@Body() createRegistrationDto: CreateRegistrationDto) {
    return this.userRegistrationService.create(createRegistrationDto);
  }

  // @Get()
  // findAll() {
  //   return this.arrangerRegistrationService.findAll(3);
  // }

  @Get(":event_id")
  findOne(@Param("event_id") event_id: string) {
    const user_id = "a791b4dc-300e-44d9-b856-2d2c61457399"; //hardcoded for testing purposes.
    return this.userRegistrationService.findOne(event_id, user_id);
  }

  // user pacth
  // @Patch(":event_id")
  // update(
  //   @Param("event_id") event_id: number,
  //   @Body() UserUpdateRegistrationDto: UserUpdateRegistrationDto,
  // ) {
  //   // TODO: get user_id from auth token when implemented
  //   let user_id = "5e7ed477-229d-43b2-ae0a-a7694ff44ac0";
  //   if (UserUpdateRegistrationDto.user_id !== undefined) {
  //     user_id = UserUpdateRegistrationDto.user_id;
  //   } else {
  //     throw new Error("Could not find user_id in the patch body, TESTING ONLY");
  //   }
  //   // TODO above when auth token is implemented

  //   return this.UserRegistrationService.update(
  //     event_id,
  //     user_id,
  //     UserUpdateRegistrationDto,
  //   );
  // }

  // arranger patch
  @Patch(":user_id")
  update(
    @Param("user_id") user_id: string,
    @Body() arrangerUpdateRegistrationDto: ArrangerUpdateRegistrationDto,
  ) {
    const event_id = "a657bb68-1585-49b7-b3dc-d068fb2177f1";
    return this.arrangerRegistrationService.update(
      event_id,
      user_id,
      arrangerUpdateRegistrationDto,
    );
  }

  @Delete(":event_id")
  remove(@Param("event_id") event_id: string) {
    const user_id = "e6b816e9-0131-4200-949b-b7ea908c9daf"; //hardcoded for testing purposes.
    // we should get this from the auth
    return this.arrangerRegistrationService.remove(event_id, user_id);
  }
}
