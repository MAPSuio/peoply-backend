import { PartialType } from "@nestjs/mapped-types";
import { ApiProperty } from "@nestjs/swagger";
import { RegStatus } from "@prisma/client";
import { IsBoolean, IsEnum, IsOptional, IsUUID } from "class-validator";
import { CreateRegistrationDto } from "./create-registration.dto";

export class ArrangerUpdateRegistrationDto extends PartialType(
  CreateRegistrationDto,
) {
  @IsUUID()
  @ApiProperty()
  userId: string;

  @IsOptional()
  @IsBoolean()
  @ApiProperty()
  attendance: boolean;

  @IsOptional()
  @IsEnum(RegStatus)
  @ApiProperty()
  regStatus: RegStatus;
}
