import { RegStatus } from ".prisma/client";
import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsInt, IsOptional } from "class-validator";
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
  @ApiProperty({ required: false })
  skip?: number;

  @IsOptional()
  @IsInt()
  @ApiProperty({ required: false })
  take?: number;
}
