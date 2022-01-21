import { reg_status } from "@prisma/client";
import { IsBooleanString, IsEnum, IsOptional } from "class-validator";
import { ToBoolean } from "validators/string.to.boolean";

export class SearchUserRegistrationDto {
  @IsOptional()
  @IsEnum(reg_status)
  reg_status?: reg_status;

  @ToBoolean()
  @IsOptional()
  @IsBooleanString()
  attendance?: boolean;

  @ToBoolean()
  @IsOptional()
  @IsBooleanString()
  include_event?: boolean;
}
