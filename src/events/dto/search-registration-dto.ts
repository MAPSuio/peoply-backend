import { reg_status } from "@prisma/client";
import { Type } from "class-transformer";
import { IsBoolean, IsOptional } from "class-validator";

export class SearchRegistrationDto {
  @IsOptional()
  //TODO custom IsRegStatus decorator
  reg_status?: reg_status;

  @IsOptional()
  @IsBoolean()
  attendance: boolean;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  include_users: boolean;
}
