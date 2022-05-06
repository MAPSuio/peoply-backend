import { PartialType } from "@nestjs/mapped-types";
import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString } from "class-validator";
import { ToBoolean } from "../../../decorators/transformers";
import { CreateOrganizationDto } from "./create-organization.dto";

export class UpdateOrganizationDto extends PartialType(CreateOrganizationDto) {
  @ToBoolean()
  @IsBoolean()
  @IsOptional()
  @ApiProperty()
  removeImage?: boolean;

  @IsString()
  @ApiProperty()
  @IsOptional()
  description?: string;

  @IsString()
  @ApiProperty()
  @IsOptional()
  name?: string;
}
