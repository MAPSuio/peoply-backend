import { ApiProperty } from "@nestjs/swagger";
import { Visibility } from "@prisma/client";
import { Type } from "class-transformer";
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MinLength,
} from "class-validator";
import { ToArray } from "../../../decorators/transformers/string.to.array";
import {
  IsLaterDateStringThan,
  MaxDateString,
  MinDateString,
} from "../../../decorators/validators";

export class CreateEventDto {
  @IsNotEmpty()
  @MinDateString(new Date())
  @ApiProperty()
  startDate: Date;

  @IsNotEmpty()
  @MaxDateString(new Date("2099-01-01T01:01:01.001Z"))
  @IsLaterDateStringThan("startDate")
  @ApiProperty()
  endDate: Date;

  @IsNotEmpty()
  @IsString()
  @MinLength(3, { message: "title too short" }) // custom message when broken
  @ApiProperty()
  title: string;

  @IsNotEmpty()
  @IsString()
  @ApiProperty()
  description: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @IsPositive()
  @ApiProperty()
  capacity?: number;

  @IsNotEmpty()
  @ToArray({ type: "int" })
  @IsArray()
  @IsInt({ each: true })
  @ApiProperty({ type: [Number] })
  categoryIds: number[];

  @IsNotEmpty()
  @IsEnum(Visibility)
  visibility: Visibility;

  @IsOptional()
  @IsUUID(4)
  @ApiProperty()
  arrangerId?: string;
}
