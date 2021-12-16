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

  // @Get()
  // findAll() {
  //   return this.registrationsService.findAll();
  // }

  // @Get(":id")
  // findOne(@Param("id") id: string) {
  //   return this.registrationsService.findOne(+id);
  // }

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

  // @Delete(":id")
  // remove(@Param("id") id: string) {
  //   return this.registrationsService.remove(+id);
  // }
}
