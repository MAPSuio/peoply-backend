import { ApiProperty } from "@nestjs/swagger";
import { Visibility } from "@prisma/client";
import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
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
import {
  IsEarlierDateStringThan,
  IsLaterDateStringThan,
  MaxDateString,
  MinDateString,
} from "../../../decorators/validators";

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

  @IsNotEmpty()
  @ToArray({ type: "int" })
  @IsArray()
  @IsInt({ each: true })
  @ApiProperty({ type: [Number] })
  categoryIds: number[];

  @IsNotEmpty()
  @IsEnum(Visibility)
  visibility: Visibility;

  @IsNotEmpty()
  @ToBoolean()
  @IsBoolean()
  @ApiProperty()
  hasFood: boolean;

  @IsOptional()
  @IsUUID(4)
  @ApiProperty()
  arrangerId?: string;

  @IsNotEmpty()
  @IsString()
  @ApiProperty()
  locationName: string;

  @IsOptional()
  @IsString()
  @ApiProperty()
  poiName?: string;

  @IsOptional()
  @IsString()
  @ApiProperty()
  country?: string;

  @IsOptional()
  @IsString()
  @ApiProperty()
  countryCode?: string;

  @IsOptional()
  @IsString()
  @ApiProperty()
  countryCodeISO3?: string;

  @IsOptional()
  @IsString()
  @ApiProperty()
  countrySubdivision?: string;

  @IsOptional()
  @IsString()
  @ApiProperty()
  localName?: string;

  @IsOptional()
  @IsString()
  @ApiProperty()
  municipality?: string;

  @IsOptional()
  @IsString()
  @ApiProperty()
  postalCode?: string;

  @IsOptional()
  @IsString()
  @ApiProperty()
  streetName?: string;

  @IsOptional()
  @IsString()
  @ApiProperty()
  streetNumber?: string;

  @IsOptional()
  @IsString()
  @ApiProperty()
  freeformAddress?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @ApiProperty()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @ApiProperty()
  longitude?: number;
}
