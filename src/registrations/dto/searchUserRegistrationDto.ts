import { reg_status } from "@prisma/client";
import { IsBoolean, IsOptional } from "class-validator";
import { ToBoolean } from "validators/string.to.boolean";

export class SearchUserRegistrationDto {
  @IsOptional()
  //TODO custom IsRegStatus decorator
  reg_status?: reg_status;

  @ToBoolean()
  @IsOptional()
  @IsBoolean()
  attendance: boolean;

  @ToBoolean()
  @IsOptional()
  @IsBoolean()
  include_event: boolean;
}
