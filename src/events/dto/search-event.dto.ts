import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from "class-validator";
import { ToBoolean } from "../../../decorators/transformers";
import { ToArray } from "../../../decorators/transformers/string.to.array";
import { IsUrlId } from "../../../decorators/validators/isUrlId.validator";
import { PagedQueryDto } from "../../util/paged-query.dto";
import { Prisma } from "../../generated/prisma/client";

export class SearchEventDto extends PagedQueryDto(Prisma.EventScalarFieldEnum) {
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
}
