import { PartialType } from "@nestjs/mapped-types";
import { ApiProperty } from "@nestjs/swagger";
import { RegStatus } from "@prisma/client";
import { IsBoolean, IsEnum, IsOptional } from "class-validator";
import { ArrangerAllowedRegStatus } from "../../users/user.constants";
import { CreateRegistrationDto } from "./create-registration.dto";

export class ArrangerUpdateRegistrationDto extends PartialType(
  CreateRegistrationDto,
) {
  @IsOptional()
  @IsBoolean()
  @ApiProperty()
  attendance: boolean;

  @IsOptional()
  @IsEnum(ArrangerAllowedRegStatus)
  @ApiProperty()
  regStatus: RegStatus;
}
