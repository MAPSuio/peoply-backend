import { RegStatus } from ".prisma/client";
import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, Min } from "class-validator";
import { ToBoolean } from "../../../decorators/transformers";

export class SearchUserRegistrationDto {
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
  includeEvent?: boolean;

  @IsOptional()
  @ToBoolean()
  @ApiProperty({ required: false })
  includeArrangers?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  @ApiProperty({ required: false })
  skip?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  @ApiProperty({ required: false })
  take?: number;
}
