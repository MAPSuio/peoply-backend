import {
  IsString,
  IsNotEmpty,
  MinLength,
  IsNumber,
  IsBoolean,
  IsEmail,
} from "class-validator";

export class CreateEventDto {
  start_date: Date;
  end_date: Date;

  @IsString()
  @IsNotEmpty()
  @MinLength(3, { message: "title too short" }) // custom message when broken
  title: string;

  @IsEmail()
  @IsString()
  @IsNotEmpty()
  description: string;

  @IsNumber()
  capacity: number;

  @IsBoolean()
  @IsNotEmpty()
  private: boolean;
}
