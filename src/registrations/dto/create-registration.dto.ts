import { reg_status } from "@prisma/client";
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsString,
  IsUUID,
} from "class-validator";

export class CreateRegistrationDto {
  @IsUUID()
  event_id: string;

  @IsString()
  @IsNotEmpty()
  user_id: string;

  @IsEnum(reg_status)
  @IsNotEmpty()
  reg_status: reg_status;

  reg_date: Date;
  attendance: boolean;
}
