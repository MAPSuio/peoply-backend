import { PartialType } from "@nestjs/mapped-types";
import { ApiProperty } from "@nestjs/swagger";
import { EventVisibility } from "../../generated/prisma/client";
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from "class-validator";
import { ToBoolean } from "../../../decorators/transformers";
import { ToArray } from "../../../decorators/transformers/string.to.array";
import { EmptyStringToNull } from "../../../decorators/transformers/empty.string.to.null";
import {
  IsDateStringOrEmptyString,
  IsEarlierDateStringThan,
  IsLaterDateStringThan,
} from "../../../decorators/validators";
import { CreateEventDto } from "./create-event.dto";
import { StringToNumberOrNull } from "../../../decorators/transformers/string.to.number.or.null";

export class UpdateEventDto extends PartialType(CreateEventDto) {
  @IsNotEmpty()
  @IsString()
  @MinLength(3, { message: "title too short" })
  @ApiProperty()
  title: string;

  @IsNotEmpty()
  @IsString()
  @ApiProperty()
  description: string;

  @IsOptional()
  @IsNumber()
  @StringToNumberOrNull()
  @ApiProperty()
  capacity?: number;

  @IsEnum(EventVisibility)
  @ApiProperty()
  visibility: EventVisibility;

  @IsNotEmpty()
  @IsDateString()
  @ApiProperty()
  startDate: Date;

  @IsDateStringOrEmptyString()
  @IsLaterDateStringThan("startDate")
  @EmptyStringToNull()
  @ApiProperty()
  endDate?: Date | null;

  @IsDateStringOrEmptyString()
  @IsEarlierDateStringThan("startDate")
  @EmptyStringToNull()
  @ApiProperty()
  regStart?: Date | null;

  @IsDateStringOrEmptyString()
  @IsLaterDateStringThan("regStart")
  @IsEarlierDateStringThan("endDate")
  @EmptyStringToNull()
  @ApiProperty()
  regEnd?: Date | null;

  @IsNotEmpty()
  @ToArray({ type: "int" })
  @IsArray()
  @ApiProperty()
  categoryIds?: number[];

  @IsOptional()
  @ToArray()
  @IsArray()
  @IsUUID(4, { each: true })
  @ApiProperty({ type: [String], required: false })
  coOrganizerOrganizationIds?: string[];

  @ToBoolean()
  @IsBoolean()
  @IsOptional()
  @ApiProperty()
  deleteImage?: boolean;

  @IsOptional()
  @IsString()
  @EmptyStringToNull()
  @ApiProperty()
  poiName?: string;

  @IsOptional()
  @IsString()
  @EmptyStringToNull()
  @ApiProperty()
  country?: string;

  @IsOptional()
  @IsString()
  @EmptyStringToNull()
  @ApiProperty()
  countryCode?: string;

  @IsOptional()
  @IsString()
  @EmptyStringToNull()
  @ApiProperty()
  countryCodeISO3?: string;

  @IsOptional()
  @IsString()
  @EmptyStringToNull()
  @ApiProperty()
  countrySubdivision?: string;

  @IsOptional()
  @IsString()
  @EmptyStringToNull()
  @ApiProperty()
  localName?: string;

  @IsOptional()
  @IsString()
  @EmptyStringToNull()
  @ApiProperty()
  municipality?: string;

  @IsOptional()
  @IsString()
  @EmptyStringToNull()
  @ApiProperty()
  postalCode?: string;

  @IsOptional()
  @IsString()
  @EmptyStringToNull()
  @ApiProperty()
  streetName?: string;

  @IsOptional()
  @IsString()
  @EmptyStringToNull()
  @ApiProperty()
  streetNumber?: string;

  @IsOptional()
  @IsString()
  @EmptyStringToNull()
  @ApiProperty()
  freeformAddress?: string;

  @IsOptional()
  @IsNumber()
  @StringToNumberOrNull()
  @ApiProperty()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @StringToNumberOrNull()
  @ApiProperty()
  longitude?: number;
}
