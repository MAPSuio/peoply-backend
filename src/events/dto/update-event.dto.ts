import { PartialType } from "@nestjs/mapped-types";
import { ApiProperty } from "@nestjs/swagger";
import { Visibility } from "@prisma/client";
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from "class-validator";
import { ToBoolean } from "../../../decorators/transformers";
import {
  IsDateStringOrEmptyString,
  IsLaterDateStringThan,
} from "../../../decorators/validators";
import { CreateEventDto } from "./create-event.dto";

export class UpdateEventDto extends PartialType(CreateEventDto) {
  @IsNotEmpty()
  @IsString()
  @MinLength(3, { message: "title too short" })
  @ApiProperty()
  title: string;

  @IsNotEmpty()
  @IsString()
  @ApiProperty()
  description: string;

  @IsNumber()
  @Min(0)
  @ApiProperty()
  capacity: number;

  @IsEnum(Visibility)
  @ApiProperty()
  visibility: Visibility;

  @IsNotEmpty()
  @IsDateString()
  @ApiProperty()
  startDate: Date;

  @IsDateStringOrEmptyString()
  @IsLaterDateStringThan("startDate")
  @ApiProperty()
  endDate?: Date | null;

  @IsNotEmpty()
  @ApiProperty()
  categoryIds?: number[];

  @ToBoolean()
  @IsBoolean()
  @IsOptional()
  @ApiProperty()
  deleteImage?: boolean;
}
