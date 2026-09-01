import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, Max, Min } from "class-validator";
import { MAX_PAGE_SIZE } from "../../util/pagination";

/**
 * How many recommendations a caller gets when they ask for no particular
 * number. It lives on the DTO rather than in the service so the value the API
 * documents and the value a request actually receives cannot be two numbers.
 */
export const DEFAULT_RECOMMENDATION_COUNT = 10;

export class SearchRecommendationsDto {
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  @Type(() => Number)
  @ApiProperty({
    required: false,
    minimum: 1,
    maximum: MAX_PAGE_SIZE,
    default: DEFAULT_RECOMMENDATION_COUNT,
  })
  take: number = DEFAULT_RECOMMENDATION_COUNT;
}
