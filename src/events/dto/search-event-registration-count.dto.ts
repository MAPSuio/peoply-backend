import { RegStatus } from ".prisma/client";
import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsOptional } from "class-validator";

export class SearchEventRegistrationCountDto {
  @IsOptional()
  @IsEnum(RegStatus)
  @ApiProperty({ required: false })
  regStatus?: RegStatus;
}
