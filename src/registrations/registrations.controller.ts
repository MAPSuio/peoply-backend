import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from "@nestjs/common";
import { RegistrationsService } from "./registrations.service";
import { CreateRegistrationDto } from "./dto/create-registration.dto";
import { UpdateRegistrationDto } from "./dto/update-registration.dto";

@Controller("registrations")
export class RegistrationsController {
  constructor(private readonly registrationsService: RegistrationsService) {}

  @Post()
  create(@Body() createRegistrationDto: CreateRegistrationDto) {
    return this.registrationsService.create(createRegistrationDto);
  }

  @Get()
  findAll() {
    return this.registrationsService.findAll();
  }

  @Get(":event_id")
  findOne(@Param("event_id") event_id: number) {
    return this.registrationsService.findOne(event_id);
  }

  @Patch(":event_id")
  update(
    @Param("event_id") event_id: number,
    @Body() updateRegistrationDto: UpdateRegistrationDto,
  ) {
    // TODO: get user_id from auth token when implemented
    let user_id = "5e7ed477-229d-43b2-ae0a-a7694ff44ac0";
    if (updateRegistrationDto.user_id !== undefined) {
      user_id = updateRegistrationDto.user_id;
    } else {
      throw new Error("Could not find user_id in the patch body, TESTING ONLY");
    }
    // TODO above when auth token is implemented

    return this.registrationsService.update(
      event_id,
      user_id,
      updateRegistrationDto,
    );
  }

  @Delete(":event_id")
  remove(@Param("event_id") event_id: number) {
    const user_id = "e6b816e9-0131-4200-949b-b7ea908c9daf"; //hardcoded for testing purposes.
    // we should get this from the auth
    return this.registrationsService.remove(event_id, user_id);
  }
}
