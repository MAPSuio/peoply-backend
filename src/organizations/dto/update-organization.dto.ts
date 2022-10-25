import { PartialType } from "@nestjs/mapped-types";
import { ApiProperty } from "@nestjs/swagger";
import {
  IsBoolean,
  IsLowercase,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
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
  @MinLength(3)
  @MaxLength(50)
  @IsLowercase()
  @ApiProperty()
  @IsOptional()
  urlId?: string;
}
