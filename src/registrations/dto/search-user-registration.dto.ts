import { reg_status } from "@prisma/client";
import { IsEnum, IsOptional } from "class-validator";
import { ToBoolean } from "validators/string.to.boolean";

export class SearchUserRegistrationDto {
  @IsOptional()
  @IsEnum(reg_status)
  reg_status?: reg_status;

  @ToBoolean()
  @IsOptional()
  attendance?: boolean;

  @ToBoolean()
  @IsOptional()
  include_event?: boolean;
}
