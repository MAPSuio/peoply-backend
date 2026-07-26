import { ApiProperty } from "@nestjs/swagger";
import { FoodPreference } from "../../generated/prisma/client";
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import { ToBoolean } from "../../../decorators/transformers";

export class UpdateUserDto {
  @ToBoolean()
  @IsBoolean()
  @IsOptional()
  @ApiProperty()
  removeImage?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @ApiProperty({ required: false })
  description?: string;

  @IsOptional()
  @IsEnum(FoodPreference)
  @ApiProperty({ required: false })
  foodPreference?: FoodPreference;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true }) // validates that each value in array is a number
  @ApiProperty({ type: [Number] })
  allergens?: number[];

  @ToBoolean()
  @IsBoolean()
  @IsOptional()
  @ApiProperty({ required: false })
  allowEmailPromotions?: boolean;

  @ToBoolean()
  @IsBoolean()
  @IsOptional()
  @ApiProperty({ required: false })
  allowEmailFromArranger?: boolean;

  @ToBoolean()
  @IsBoolean()
  @IsOptional()
  @ApiProperty({ required: false })
  allowEmailOnWaitlist?: boolean;
}
