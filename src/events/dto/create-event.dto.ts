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
  start_date: Date;

  @IsNotEmpty()
  @MaxDateString(new Date("2099-01-01T01:01:01.001Z"))
  @IsLaterDateStringThan("start_date")
  end_date: Date;

  @IsNotEmpty()
  @IsString()
  @MinLength(3, { message: "title too short" }) // custom message when broken
  title: string;

  @IsNotEmpty()
  @IsString()
  description: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  capacity?: number;

  @IsNotEmpty()
  @IsBoolean()
  private?: boolean;

  @IsNotEmpty()
  @IsArray()
  @IsInt({ each: true })
  category_ids: number[];
}
