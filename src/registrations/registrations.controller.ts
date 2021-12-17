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
import { ArrangerRegService } from "./services/arranger.registrations.service";
import { CreateRegistrationDto } from "./dto/create-registration.dto";
import { UserUpdateRegistrationDto } from "./dto/user-update-registration.dto";
import { ArrangerUpdateRegistrationDto } from "./dto/arranger-update-registration.dto";

// This endpoint is for testing only.
@Controller("registrations")
export class RegistrationsController {
  constructor(
    private readonly UserRegService: UserRegService,
    private readonly ArrangerRegService: ArrangerRegService,
  ) {}

  @Post()
  create(@Body() createRegistrationDto: CreateRegistrationDto) {
    return this.UserRegService.create(createRegistrationDto);
  }

  @Get()
  findAll() {
    const user_id = "a791b4dc-300e-44d9-b856-2d2c61457399"; //hardcoded for testing purposes.
    return this.ArrangerRegService.findAll(3);
  }

  @Get(":event_id")
  findOne(@Param("event_id") event_id: number) {
    const user_id = "a791b4dc-300e-44d9-b856-2d2c61457399"; //hardcoded for testing purposes.
    return this.UserRegService.findOne(event_id, user_id);
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

  //   return this.UserRegService.update(
  //     event_id,
  //     user_id,
  //     UserUpdateRegistrationDto,
  //   );
  // }

  // arranger patch
  @Patch(":user_id")
  update(
    @Param("user_id") user_id: string,
    @Body() ArrangerUpdateRegistrationDto: ArrangerUpdateRegistrationDto,
  ) {
    const event_id = 1;
    return this.ArrangerRegService.update(
      event_id,
      user_id,
      ArrangerUpdateRegistrationDto,
    );
  }

  @Delete(":event_id")
  remove(@Param("event_id") event_id: number) {
    const user_id = "e6b816e9-0131-4200-949b-b7ea908c9daf"; //hardcoded for testing purposes.
    // we should get this from the auth
    return this.ArrangerRegService.remove(event_id, user_id);
  }
}
