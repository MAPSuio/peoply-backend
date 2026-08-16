import { applyDecorators } from "@nestjs/common";
import { PartialType } from "@nestjs/mapped-types";
import { ApiProperty } from "@nestjs/swagger";
import {
  IsBoolean,
  IsLowercase,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from "class-validator";
import { ToBoolean } from "../../../decorators/transformers";
import { CreateOrganizationDto } from "./create-organization.dto";

/** An optional social-media link; a full URL with protocol or null to clear. */
const SocialUrl = () =>
  applyDecorators(
    IsString(),
    IsUrl({ require_protocol: true }),
    ApiProperty(),
    IsOptional(),
  );

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
  urlId?: string | null;

  @SocialUrl()
  websiteUrl?: string | null;

  @SocialUrl()
  instagramUrl?: string | null;

  @SocialUrl()
  facebookUrl?: string | null;

  @SocialUrl()
  tiktokUrl?: string | null;

  @SocialUrl()
  linkedinUrl?: string | null;

  @SocialUrl()
  youtubeUrl?: string | null;
}
