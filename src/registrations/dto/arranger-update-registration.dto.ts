import { PartialType } from "@nestjs/mapped-types";
import { IsBoolean } from "class-validator";
import { CreateRegistrationDto } from "./create-registration.dto";

export class ArrangerUpdateRegistrationDto extends PartialType(
  CreateRegistrationDto,
) {
  //event is without tags so it will be filtered out if specified by the user.
  event_id: number;

  @IsBoolean()
  attendance: boolean;
}
