import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  MinLength,
} from "class-validator";
import { ToBoolean } from "../../../decorators/transformers";

export class LocationSearchQueryDto {
  @IsString()
  @MinLength(1)
  @ApiProperty({ description: "Free-text address or place query." })
  query: string;

  @IsOptional()
  @IsString()
  @Length(2, 2)
  @ApiPropertyOptional({
    description: "Two-letter ISO-3166-1 country code used to scope results.",
    example: "NO",
  })
  countryCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @ApiPropertyOptional({
    description: "Latitude used to bias nearby results.",
    example: 59.9434,
  })
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @ApiPropertyOptional({
    description: "Longitude used to bias nearby results.",
    example: 10.7178,
  })
  lon?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(10)
  @ApiPropertyOptional({
    description: "Maximum number of suggestions to return.",
    minimum: 1,
    maximum: 10,
    example: 5,
  })
  limit?: number;

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  @ApiPropertyOptional({
    description: "Whether POI results should be included alongside addresses.",
    example: true,
  })
  includePoi?: boolean;
}
