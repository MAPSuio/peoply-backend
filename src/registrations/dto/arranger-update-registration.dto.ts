import { PartialType } from "@nestjs/mapped-types";
import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean } from "class-validator";
import { CreateRegistrationDto } from "./create-registration.dto";

export class ArrangerUpdateRegistrationDto extends PartialType(
  CreateRegistrationDto,
) {
  @IsBoolean()
  @ApiProperty()
  attendance: boolean;
}
