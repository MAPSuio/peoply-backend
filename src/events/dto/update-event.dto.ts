import { PartialType } from "@nestjs/mapped-types";
import { ApiProperty } from "@nestjs/swagger";
import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsString,
  Min,
  MinLength,
} from "class-validator";
import { IsLaterDateStringThan } from "../../../decorators/validators";
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

  @IsBoolean()
  @ApiProperty()
  private: boolean;

  @IsNotEmpty()
  @IsDateString()
  @ApiProperty()
  startDate: Date;

  @IsNotEmpty()
  @IsDateString()
  @IsLaterDateStringThan("startDate")
  @ApiProperty()
  endDate: Date;
}
