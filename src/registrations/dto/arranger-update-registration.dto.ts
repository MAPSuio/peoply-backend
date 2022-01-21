import { PartialType } from "@nestjs/mapped-types";
import { IsBoolean } from "class-validator";
import { CreateRegistrationDto } from "./create-registration.dto";

export class ArrangerUpdateRegistrationDto extends PartialType(
  CreateRegistrationDto,
) {
  @IsBoolean()
  attendance: boolean;
}
