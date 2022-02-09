import { RegStatus } from ".prisma/client";
import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsOptional } from "class-validator";
import { ToBoolean } from "../../../decorators/transformers";

export class SearchEventRegistrationDto {
  @IsOptional()
  @IsEnum(RegStatus)
  @ApiProperty({ required: false })
  regStatus?: RegStatus;

  @IsOptional()
  @ToBoolean()
  @ApiProperty({ required: false })
  attendance?: boolean;

  @IsOptional()
  @ToBoolean()
  @ApiProperty({ required: false })
  includeUsers?: boolean;
}
