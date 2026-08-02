import { RegStatus } from "../../generated/prisma/client";
import { PartialType } from "@nestjs/mapped-types";
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
import { CreateRegistrationDto } from "./create-registration.dto";
import { MAX_FORM_ANSWER_LENGTH } from "../registration.constants";

export class UserUpdateRegistrationDto extends PartialType(
  CreateRegistrationDto,
) {
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
