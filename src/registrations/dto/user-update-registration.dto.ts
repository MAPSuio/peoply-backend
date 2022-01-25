import { reg_status } from ".prisma/client";
import { PartialType } from "@nestjs/mapped-types";
import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsNotEmpty, IsUUID } from "class-validator";
import { UserAllowedRegStatus } from "../../users/user.constants";
import { CreateRegistrationDto } from "./create-registration.dto";

export class UserUpdateRegistrationDto extends PartialType(
  CreateRegistrationDto,
) {
  @IsNotEmpty()
  @IsUUID(4)
  @ApiProperty()
  event_id: string;

  @IsNotEmpty()
  @IsEnum(UserAllowedRegStatus)
  @ApiProperty()
  reg_status: reg_status;
}
