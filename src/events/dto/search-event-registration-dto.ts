import { reg_status } from "@prisma/client";
import { IsBoolean, IsOptional } from "class-validator";
import { ToBoolean } from "validators/string.to.boolean";

export class SearchEventRegistrationDto {
  @IsOptional()
  //TODO custom IsRegStatus decorator
  reg_status?: reg_status;

  @ToBoolean()
  @IsOptional()
  @IsBoolean()
  include_users: boolean;
}
