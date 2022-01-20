import { reg_status } from "@prisma/client";
import { IsBoolean, IsEnum, IsOptional } from "class-validator";
import { ToBoolean } from "validators/string.to.boolean";

export class SearchEventRegistrationDto {
  @IsOptional()
  @IsEnum(reg_status)
  reg_status?: reg_status;

  @ToBoolean()
  @IsOptional()
  @IsBoolean()
  attendance: boolean;

  @ToBoolean()
  @IsOptional()
  @IsBoolean()
  include_users: boolean;
}
