import { PartialType } from "@nestjs/mapped-types";
import {
  IsBoolean,
  IsEmail,
  IsNumber,
  IsString,
  MinLength,
} from "class-validator";
import { CreateEventDto } from "./create-event.dto";

export class UpdateEventDto extends PartialType(CreateEventDto) {
  event_id: number;

  @IsString()
  @MinLength(3, { message: "title too short" }) // custom message when broken
  title: string;

  @IsEmail()
  @IsString()
  description: string;

  @IsNumber()
  capacity: number;

  @IsBoolean()
  private: boolean;
}
