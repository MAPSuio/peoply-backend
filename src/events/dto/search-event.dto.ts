import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from "class-validator";
import { ToBoolean } from "../../../decorators/transformers";
import { ToArray } from "../../../decorators/transformers/string.to.array";
import { IsUrlId } from "../../../decorators/validators/isUrlId.validator";
import { PrismaOrderDirections } from "../../prisma/prisma.constants";
import { MAX_PAGE_SIZE } from "../../util/pagination";
import { Prisma } from "../../generated/prisma/client";

/** The Event table's own columns — the only things Prisma may be told to sort by. */
const EVENT_SCALAR_FIELDS = Object.keys(Prisma.EventScalarFieldEnum);

export class SearchEventDto {
  @IsOptional()
  @IsString()
  @IsUrlId()
  @ApiProperty({ required: false })
  urlId?: string;

  @IsOptional()
  @IsDateString()
  @ApiProperty({ required: false })
  afterDate?: Date;

  @IsOptional()
  @IsDateString()
  @ApiProperty({ required: false })
  beforeDate?: Date;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @ApiProperty({ required: false })
  title?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false })
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  @ApiProperty({ required: false })
  capacity?: number;

  @IsOptional()
  @IsUUID(4)
  @ApiProperty({ required: false })
  userId?: string;

  @IsOptional()
  @IsUUID(4)
  @ApiProperty({ required: false })
  organizationId?: string;

  @IsOptional()
  @ToArray()
  @IsArray()
  @IsUUID(4, { each: true })
  @ApiProperty({ type: [String], required: false })
  arrangerIds?: string[];

  @IsOptional()
  @ToArray({ type: "int" })
  @IsArray()
  @IsInt({ each: true })
  @ApiProperty({ type: [Number], required: false })
  categoryIds?: number[];

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  @ApiProperty()
  featured?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  @ApiProperty({ required: false })
  skip?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_PAGE_SIZE)
  @Type(() => Number)
  @ApiProperty({ required: false, maximum: MAX_PAGE_SIZE })
  take?: number;

  /* Reached `findAll` as `orderBy: { [orderBy]: orderDirection }` with nothing
     but @IsString() in the way, so any non-column name - a relation such as
     `eventArrangers`, or anything at all - made Prisma raise a validation error
     that PrismaExceptionFilter does not catch. `GET /events` needs no cookie,
     so that was an unauthenticated 500 and log noise on demand.

     Checked against Prisma's own list of scalar columns rather than a
     hand-written one, so it cannot drift from the schema. The registration
     services do the same job with a dummy object; this is the same idea
     without a literal to keep in sync. */
  @IsOptional()
  @IsString()
  @IsIn(EVENT_SCALAR_FIELDS, {
    message: `orderBy must be one of the event's own columns`,
  })
  @ApiProperty({ required: false, enum: EVENT_SCALAR_FIELDS })
  orderBy?: string;

  @IsOptional()
  @IsString()
  @IsEnum(PrismaOrderDirections, {
    message:
      "Must be either one of the values: '" +
      PrismaOrderDirections.ASC +
      "' or '" +
      PrismaOrderDirections.DESC +
      "'",
  })
  @ApiProperty({ required: false })
  orderDirection?: string;
}
