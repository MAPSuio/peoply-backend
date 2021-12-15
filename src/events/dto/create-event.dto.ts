import {
  IsString,
  IsNotEmpty,
  MinLength,
  IsNumber,
  IsBoolean,
  IsOptional,
  IsDateString,
} from "class-validator";

export class CreateEventDto {
  @IsNotEmpty()
  @IsDateString()
  start_date: Date;

  @IsNotEmpty()
  @IsDateString()
  end_date: Date;

  @IsString()
  @IsNotEmpty()
  @MinLength(3, { message: "title too short" }) // custom message when broken
  title: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsOptional()
  @IsNumber()
  capacity: number;

  @IsBoolean()
  @IsNotEmpty()
  private: boolean;
}
