import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";
import { ToArray } from "../../../decorators/transformers/string.to.array";
import { MAX_PAGE_SIZE } from "../../util/pagination";

export class SearchOrganizationDto {
  @IsOptional()
  @IsString()
  @ApiProperty({ required: false })
  name?: string;

  @IsOptional()
  @ToArray()
  @IsArray()
  @ApiProperty({ required: false })
  orgNrs?: string[];

  @IsOptional()
  @IsString()
  @ApiProperty({ required: false })
  description?: string;

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
}
