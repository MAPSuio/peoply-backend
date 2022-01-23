import { reg_status } from ".prisma/client";
import { IsEnum, IsNotEmpty, IsUUID } from "class-validator";
import { UserAllowedRegStatus } from "../../users/user.constants";

export class CreateRegistrationDto {
  @IsNotEmpty()
  @IsUUID(4)
  event_id: string;

  @IsNotEmpty()
  @IsEnum(UserAllowedRegStatus)
  reg_status: reg_status;
}
