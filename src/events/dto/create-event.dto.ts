import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  MinLength,
} from "class-validator";
import { ToBoolean } from "../../../decorators/transformers";
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
  start_date: Date;

  @IsNotEmpty()
  @MaxDateString(new Date("2099-01-01T01:01:01.001Z"))
  @IsLaterDateStringThan("start_date")
  @ApiProperty()
  end_date: Date;

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
  @ToBoolean()
  @IsBoolean()
  @ApiProperty()
  private?: boolean;

  @IsNotEmpty()
  @ToArray({ type: "int" })
  @IsArray()
  @IsInt({ each: true })
  @ApiProperty({ type: [Number] })
  category_ids: number[];
}
