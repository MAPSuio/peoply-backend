import { ApiProperty } from "@nestjs/swagger";
import {
  IsString,
  IsNotEmpty,
  MinLength,
  IsNumber,
  IsBoolean,
  IsOptional,
  IsPositive,
  IsArray,
  IsInt,
} from "class-validator";
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
  @IsNumber()
  @IsPositive()
  @ApiProperty()
  capacity?: number;

  @IsNotEmpty()
  @IsBoolean()
  @ApiProperty()
  private?: boolean;

  @IsNotEmpty()
  @IsArray()
  @IsInt({ each: true })
  @ApiProperty({ type: [Number] })
  category_ids: number[];
}
