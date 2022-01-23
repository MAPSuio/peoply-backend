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
  event_id?: number;

  @IsOptional()
  @IsDateString()
  afterDate?: Date;

  @IsOptional()
  @IsDateString()
  beforeDate?: Date;

  @IsOptional()
  @IsString()
  @MinLength(3)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  capacity?: number;

  @IsOptional()
  @IsUUID(4)
  user_id?: string;

  @IsOptional()
  @IsUUID(4)
  organization_id?: string;

  @IsOptional()
  @IsUUID(4)
  arranger_id?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  skip?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  take?: number;

  @IsOptional()
  @IsString()
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
  orderDirection?: string;
}
