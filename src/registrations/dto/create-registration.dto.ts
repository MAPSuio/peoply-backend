import { RegStatus } from "../../generated/prisma/client";
import { ApiProperty } from "@nestjs/swagger";
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";
import { UserAllowedRegStatus } from "../../users/user.constants";
import { MAX_FORM_ANSWER_LENGTH } from "../registration.constants";

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
  @MaxLength(MAX_FORM_ANSWER_LENGTH)
  @ApiProperty()
  formAnswer?: string;
}
