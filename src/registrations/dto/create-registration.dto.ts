import { reg_status } from "@prisma/client";
import { IsNotEmpty, IsNumber, IsString } from "class-validator";

export class CreateRegistrationDto {
  @IsNumber()
  event_id: number;

  @IsString()
  @IsNotEmpty()
  user_id: string;

  // @IsRegStatus() // TODO: make custom decorator
  @IsNotEmpty()
  reg_status: reg_status;

  reg_date: Date;

  attendance: boolean;
}
