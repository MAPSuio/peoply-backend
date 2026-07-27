import { Transform } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from "class-validator";
import { ToArray, ToBoolean } from "../../../decorators/transformers";

const ToOptionalNumber = () =>
  Transform(
    ({ value }) => {
      if (value === null || value === undefined || value === "") {
        return undefined;
      }

      if (typeof value === "number") {
        return value;
      }

      return Number(value);
    },
    { toClassOnly: true },
  );

export class AzureMapsFuzzySearchQueryDto {
  @Transform(
    ({ value }) => (typeof value === "string" ? value.trim() : value),
    { toClassOnly: true },
  )
  @IsString()
  @MinLength(1)
  query: string;

  @IsOptional()
  @ToArray()
  @IsArray()
  @IsString({ each: true })
  brandSet?: string[];

  @IsOptional()
  @IsString()
  btmRight?: string;

  @IsOptional()
  @ToArray()
  @IsArray()
  @IsString({ each: true })
  connectorSet?: string[];

  @IsOptional()
  @ToArray()
  @IsArray()
  @IsString({ each: true })
  countrySet?: string[];

  @IsOptional()
  @IsString()
  extendedPostalCodesFor?: string;

  @IsOptional()
  @ToArray()
  @IsArray()
  @IsString({ each: true })
  idxSet?: string[];

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @ToOptionalNumber()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @IsOptional()
  @ToOptionalNumber()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @ToOptionalNumber()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lon?: number;

  @IsOptional()
  @ToOptionalNumber()
  @IsNumber()
  @Min(1)
  @Max(4)
  maxFuzzyLevel?: number;

  @IsOptional()
  @ToOptionalNumber()
  @IsNumber()
  @Min(1)
  @Max(4)
  minFuzzyLevel?: number;

  @IsOptional()
  @ToOptionalNumber()
  @IsNumber()
  @Min(0)
  @Max(1900)
  ofs?: number;

  @IsOptional()
  @IsIn(["nextSevenDays"])
  openingHours?: "nextSevenDays";

  @IsOptional()
  @ToOptionalNumber()
  @IsNumber()
  @Min(0)
  radius?: number;

  @IsOptional()
  @IsString()
  topLeft?: string;

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  typeahead?: boolean;

  @IsOptional()
  @IsString()
  view?: string;
}
