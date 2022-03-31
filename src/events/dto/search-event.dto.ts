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
import { IsUrlId } from "../../../decorators/validators/isUrlId.validator";
import { PrismaOrderDirections } from "../../prisma/prisma.constants";

export class SearchEventDto {
  @IsOptional()
  @IsString()
  @IsUrlId()
  @ApiProperty({ required: false })
  urlId?: string;

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
  userId?: string;

  @IsOptional()
  @IsUUID(4)
  @ApiProperty({ required: false })
  organizationId?: string;

  @IsOptional()
  @IsUUID(4)
  @ApiProperty({ required: false })
  arrangerId?: string;

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
