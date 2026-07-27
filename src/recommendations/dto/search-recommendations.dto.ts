import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";
import { MAX_PAGE_SIZE } from "../../util/pagination";

export class SearchRecommendationsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  @Type(() => Number)
  @ApiProperty({ required: false, maximum: MAX_PAGE_SIZE })
  take?: number;
}
