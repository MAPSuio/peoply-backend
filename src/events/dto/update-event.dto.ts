import { OmitType, PartialType } from "@nestjs/mapped-types";
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
  IsPositive,
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
import {
  ClearableAddressText,
  ClearableCoordinate,
} from "./address-fields.decorator";

/* `arrangerId` is inherited from CreateEventDto, so whitelist:true kept it -
   but `Event` has no such column (the relation lives in EventArranger), and
   `update` spreads whatever is left straight into `trx.event.update`. Any
   PATCH carrying it raised a PrismaClientValidationError, which
   PrismaExceptionFilter does not catch, i.e. a 500. Omitted rather than
   validated: there is no code path that moves an existing event to another
   arranger, so accepting the field at all was the mistake. */
export class UpdateEventDto extends PartialType(
  OmitType(CreateEventDto, ["arrangerId"] as const),
) {
  @IsNotEmpty()
  @IsString()
  @MinLength(3, { message: "title too short" })
  @ApiProperty()
  title: string;

  @IsNotEmpty()
  @IsString()
  @ApiProperty()
  description: string;

  /* Overrides CreateEventDto's `@IsPositive()`, which is why it needs its
     own. The guard that stops capacity being lowered below the current GOING
     count reads `capacity > 0` (events.service.ts), so `capacity: 0` and
     negatives went straight past it - leaving an event whose seat check can
     never pass and whose attendees are stuck. `null` still means unlimited:
     @IsOptional() skips it. */
  @IsOptional()
  @IsNumber()
  @IsPositive()
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

  @ClearableAddressText()
  poiName?: string;

  @ClearableAddressText()
  country?: string;

  @ClearableAddressText()
  countryCode?: string;

  @ClearableAddressText()
  countryCodeISO3?: string;

  @ClearableAddressText()
  countrySubdivision?: string;

  @ClearableAddressText()
  localName?: string;

  @ClearableAddressText()
  municipality?: string;

  @ClearableAddressText()
  postalCode?: string;

  @ClearableAddressText()
  streetName?: string;

  @ClearableAddressText()
  streetNumber?: string;

  @ClearableAddressText()
  freeformAddress?: string;

  @ClearableCoordinate()
  latitude?: number;

  @ClearableCoordinate()
  longitude?: number;
}
