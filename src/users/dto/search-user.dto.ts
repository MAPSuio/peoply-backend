import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from "class-validator";
import { MAX_PAGE_SIZE } from "../../util/pagination";

export class SearchUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

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
