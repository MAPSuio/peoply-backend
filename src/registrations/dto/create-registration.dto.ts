import { reg_status } from "@prisma/client";
import { IsEnum, IsNotEmpty, IsUUID } from "class-validator";

export class CreateRegistrationDto {
  @IsUUID()
  event_id: string;

  @IsEnum(reg_status)
  @IsNotEmpty()
  reg_status: reg_status;

  user_id: string;
  reg_date: Date;
  attendance: boolean;
}
