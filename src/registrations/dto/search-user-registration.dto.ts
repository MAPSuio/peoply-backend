import { reg_status } from ".prisma/client";
import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsOptional } from "class-validator";
import { ToBoolean } from "../../../decorators/transformers";

export class SearchUserRegistrationDto {
  @IsOptional()
  @IsEnum(reg_status)
  @ApiProperty({ required: false })
  reg_status?: reg_status;

  @IsOptional()
  @ToBoolean()
  @ApiProperty({ required: false })
  attendance?: boolean;

  @IsOptional()
  @ToBoolean()
  @ApiProperty({ required: false })
  include_event?: boolean;
}
