import { RegStatus } from ".prisma/client";
import { ApiProperty } from "@nestjs/swagger";
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from "class-validator";
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

  @IsOptional()
  @IsString()
  @ApiProperty()
  formAnswer?: string;
}
