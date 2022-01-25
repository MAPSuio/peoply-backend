import { reg_status } from ".prisma/client";
import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsNotEmpty, IsUUID } from "class-validator";
import { UserAllowedRegStatus } from "../../users/user.constants";

export class CreateRegistrationDto {
  @IsNotEmpty()
  @IsUUID(4)
  @ApiProperty()
  event_id: string;

  @IsNotEmpty()
  @IsEnum(UserAllowedRegStatus)
  @ApiProperty()
  reg_status: reg_status;
}
