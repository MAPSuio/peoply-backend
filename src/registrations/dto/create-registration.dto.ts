import { RegStatus } from ".prisma/client";
import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsNotEmpty, IsUUID } from "class-validator";
import { UserAllowedRegStatus } from "../../users/user.constants";

export class CreateRegistrationDto {
  @IsNotEmpty()
  @IsUUID(4)
  @ApiProperty()
  eventId: string;

  @IsNotEmpty()
  @IsEnum(UserAllowedRegStatus)
  @ApiProperty()
  regStatus: RegStatus;
}
