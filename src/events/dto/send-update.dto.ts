import { ApiProperty } from "@nestjs/swagger";
import { EventUpdateVisibility } from "@prisma/client";
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from "class-validator";
import { ToBoolean } from "../../../decorators/transformers";

export class SendUpdateDto {
  @IsNotEmpty()
  @IsString()
  @ApiProperty()
  subject: string;

  @IsNotEmpty()
  @IsString()
  @ApiProperty()
  body: string;

  @IsOptional()
  @IsString()
  @ApiProperty()
  replyTo?: string;

  @IsNotEmpty()
  @IsEnum(EventUpdateVisibility)
  @ApiProperty()
  visibility: EventUpdateVisibility;

  @IsNotEmpty()
  @ToBoolean()
  @IsBoolean()
  @ApiProperty()
  sendEmail: boolean;
}
