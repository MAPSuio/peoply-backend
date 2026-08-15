import { ApiProperty } from "@nestjs/swagger";
import {
  EventRegistrationMode,
  EventVisibility,
} from "../../generated/prisma/client";
import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";
import { ToBoolean } from "../../../decorators/transformers";
import { ToArray } from "../../../decorators/transformers/string.to.array";
import {
  IsEarlierDateStringThan,
  IsLaterDateStringThan,
  MaxDateString,
  MinDateString,
} from "../../../decorators/validators";
import { AddressText, Coordinate } from "./address-fields.decorator";

export class CreateEventDto {
  @IsNotEmpty()
  @MinDateString(new Date())
  @ApiProperty()
  startDate: Date;

  @IsOptional()
  @MaxDateString(new Date("2099-01-01T01:01:01.001Z"))
  @IsLaterDateStringThan("startDate")
  @ApiProperty()
  endDate?: Date | null;

  @IsOptional()
  @MaxDateString(new Date("2099-01-01T01:01:01.001Z"))
  @IsEarlierDateStringThan("startDate")
  @ApiProperty()
  regStart?: Date | null;

  @IsOptional()
  @MaxDateString(new Date("2099-01-01T01:01:01.001Z"))
  @IsLaterDateStringThan("regStart")
  @IsEarlierDateStringThan("endDate")
  @ApiProperty()
  regEnd?: Date | null;

  @IsNotEmpty()
  @IsString()
  @MinLength(3, { message: "title too short" }) // custom message when broken
  @ApiProperty()
  title: string;

  @IsNotEmpty()
  @IsString()
  @ApiProperty()
  description: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @IsPositive()
  @ApiProperty()
  capacity?: number;

  @IsOptional()
  @IsString()
  @ApiProperty()
  formQuestion?: string;

  @IsNotEmpty()
  @ToArray({ type: "int" })
  @IsArray()
  @IsInt({ each: true })
  @ApiProperty({ type: [Number] })
  categoryIds: number[];

  @IsNotEmpty()
  @IsEnum(EventVisibility)
  visibility: EventVisibility;

  @IsNotEmpty()
  @ToBoolean()
  @IsBoolean()
  @ApiProperty()
  hasFood: boolean;

  @IsOptional()
  @IsEnum(EventRegistrationMode)
  @ApiProperty()
  registrationMode?: EventRegistrationMode;

  /* Rendered by JoinButton as window.open(externalUrl), so a javascript: or
     data: value here is stored XSS. The form already restricts this to
     ^https?://, but only in the browser. */
  @IsOptional()
  @IsUrl({ protocols: ["http", "https"], require_protocol: true })
  @MaxLength(2048)
  @ApiProperty()
  externalUrl?: string;

  @IsOptional()
  @IsUUID(4)
  @ApiProperty()
  arrangerId?: string;

  @IsOptional()
  @ToArray()
  @IsArray()
  @IsUUID(4, { each: true })
  @ApiProperty({ type: [String], required: false })
  coOrganizerOrganizationIds?: string[];

  @IsNotEmpty()
  @IsString()
  @ApiProperty()
  locationName: string;

  @AddressText()
  poiName?: string;

  @AddressText()
  country?: string;

  @AddressText()
  countryCode?: string;

  @AddressText()
  countryCodeISO3?: string;

  @AddressText()
  countrySubdivision?: string;

  @AddressText()
  localName?: string;

  @AddressText()
  municipality?: string;

  @AddressText()
  postalCode?: string;

  @AddressText()
  streetName?: string;

  @AddressText()
  streetNumber?: string;

  @AddressText()
  freeformAddress?: string;

  @Coordinate()
  latitude?: number;

  @Coordinate()
  longitude?: number;
}
