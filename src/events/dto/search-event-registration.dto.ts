import { reg_status } from ".prisma/client";
import { IsEnum, IsOptional } from "class-validator";
import { ToBoolean } from "../../../decorators/transformers";

export class SearchEventRegistrationDto {
  @IsOptional()
  @IsEnum(reg_status)
  reg_status?: reg_status;

  @IsOptional()
  @ToBoolean()
  attendance?: boolean;

  @IsOptional()
  @ToBoolean()
  include_users?: boolean;
}
