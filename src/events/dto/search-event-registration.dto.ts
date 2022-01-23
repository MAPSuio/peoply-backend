import { reg_status } from ".prisma/client";
import { IsEnum, IsOptional } from "class-validator";
import { ToBoolean } from "src/validators/string.to.boolean";

export class SearchEventRegistrationDto {
  @IsOptional()
  @IsEnum(reg_status)
  reg_status?: reg_status;

  @ToBoolean()
  @IsOptional()
  attendance: boolean;

  @ToBoolean()
  @IsOptional()
  include_users: boolean;
}
