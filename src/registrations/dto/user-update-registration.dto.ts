import { RegStatus } from "../../generated/prisma/client";
import { PartialType } from "@nestjs/mapped-types";
import { ApiProperty } from "@nestjs/swagger";
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from "class-validator";
import { UserAllowedRegStatus } from "../../users/user.constants";
import { CreateRegistrationDto } from "./create-registration.dto";

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
  @ApiProperty()
  formAnswer?: string;
}
