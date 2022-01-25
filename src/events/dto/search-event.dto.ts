import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from "class-validator";
import { PrismaOrderDirections } from "../../prisma/prisma.constants";

export class SearchEventDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @ApiProperty({ required: false })
  event_id?: number;

  @IsOptional()
  @IsDateString()
  @ApiProperty({ required: false })
  afterDate?: Date;

  @IsOptional()
  @IsDateString()
  @ApiProperty({ required: false })
  beforeDate?: Date;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @ApiProperty({ required: false })
  title?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false })
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  @ApiProperty({ required: false })
  capacity?: number;

  @IsOptional()
  @IsUUID(4)
  @ApiProperty({ required: false })
  user_id?: string;

  @IsOptional()
  @IsUUID(4)
  @ApiProperty({ required: false })
  organization_id?: string;

  @IsOptional()
  @IsUUID(4)
  @ApiProperty({ required: false })
  arranger_id?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  @ApiProperty({ required: false })
  skip?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  @ApiProperty({ required: false })
  take?: number;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false })
  orderBy?: string;

  @IsOptional()
  @IsString()
  @IsEnum(PrismaOrderDirections, {
    message:
      "Must be either one of the values: '" +
      PrismaOrderDirections.ASC +
      "' or '" +
      PrismaOrderDirections.DESC +
      "'",
  })
  @ApiProperty({ required: false })
  orderDirection?: string;
}
