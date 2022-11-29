import { ApiProperty } from "@nestjs/swagger";
import { FoodPreference } from "@prisma/client";
import {
  IsBoolean,
  IsEnum,
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
