import { PartialType } from "@nestjs/mapped-types";
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsString,
  MinLength,
} from "class-validator";
import { CreateEventDto } from "./create-event.dto";

export class UpdateEventDto extends PartialType(CreateEventDto) {
  //event is without tags so it will be filtered out if specified by the user.
  event_id: number;

  @IsNotEmpty()
  @IsString()
  @MinLength(3, { message: "title too short" })
  title: string;

  @IsNotEmpty()
  @IsString()
  description: string;

  @IsNumber()
  capacity: number;

  @IsBoolean()
  private: boolean;

  @IsNotEmpty()
  @IsDateString()
  start_date: Date;

  @IsNotEmpty()
  @IsDateString()
  end_date: Date;
}
