import { reg_status } from ".prisma/client";
import { PartialType } from "@nestjs/mapped-types";
import { IsNotEmpty } from "class-validator";
import { CreateRegistrationDto } from "./create-registration.dto";

export class UpdateRegistrationDto extends PartialType(CreateRegistrationDto) {
  //event is without tags so it will be filtered out if specified by the user.
  event_id: number;

  // @IsRegStatus() // TODO: make custom decorator
  @IsNotEmpty()
  reg_status: reg_status;
}
