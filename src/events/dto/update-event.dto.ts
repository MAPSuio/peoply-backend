import { OmitType, PartialType } from "@nestjs/mapped-types";
import { ApiProperty } from "@nestjs/swagger";
import { EventVisibility } from "../../generated/prisma/client";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
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
  @MaxLength(150)
  @ApiProperty()
  title: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(10000)
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
  @ArrayMaxSize(50)
  @IsUUID(4, { each: true })
  @ApiProperty({ type: [String], required: false })
  coOrganizerOrganizationIds?: string[];

  /* The edit form submits every field on every save and writes "" for the ones
     that are empty, so a PATCH of an event without external registration
     always carries `externalUrl: ""`. `@IsOptional()` only skips undefined and
     null, so the inherited `@IsUrl` failed every one of those saves with a
     400. "" is how the client says "no external URL"; the service turns it
     into null. The scheme restriction still applies to anything non-empty -
     JoinButton hands this value to window.open. */
  @IsOptional()
  @ValidateIf((dto: UpdateEventDto) => dto.externalUrl !== "")
  @IsUrl({ protocols: ["http", "https"], require_protocol: true })
  @MaxLength(2048)
  @ApiProperty()
  externalUrl?: string;

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
