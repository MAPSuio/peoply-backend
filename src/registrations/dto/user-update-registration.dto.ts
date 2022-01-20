import { reg_status } from ".prisma/client";
import { PartialType } from "@nestjs/mapped-types";
import { IsEnum, IsNotEmpty, IsUUID } from "class-validator";
import { CreateRegistrationDto } from "./create-registration.dto";

export class UserUpdateRegistrationDto extends PartialType(
  CreateRegistrationDto,
) {
  @IsNotEmpty()
  @IsUUID()
  event_id: string;

  @IsEnum(reg_status)
  @IsNotEmpty()
  reg_status: reg_status;
}
