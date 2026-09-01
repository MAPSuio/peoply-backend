import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";
import { DEFAULT_SEARCH_PAGE_SIZE, MAX_PAGE_SIZE } from "./pagination";

/**
 * The `skip`/`take` pair every paginated search endpoint takes.
 *
 * It is a base class rather than four copies because the copies drifted: one
 * of them carried `@Min(1)` on `skip`, so `?skip=0` — the first page — answered
 * 400 on that one endpoint alone. pagination.spec.ts asserts the bounds across
 * all the search DTOs; inheriting them means there is nothing left to drift.
 *
 * A DTO that needs a tighter bound can still add one: class-validator applies
 * the inherited constraints and the subclass's own together.
 */
export class PaginationDto {
  /** An offset, not a page number: 0 is the first page. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  @ApiProperty({ required: false, minimum: 0, default: 0 })
  skip?: number = 0;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_PAGE_SIZE)
  @Type(() => Number)
  @ApiProperty({
    required: false,
    minimum: 0,
    maximum: MAX_PAGE_SIZE,
    default: MAX_PAGE_SIZE,
  })
  take?: number = MAX_PAGE_SIZE;
}

/**
 * The same bounds for the search endpoints, which answer with a page rather
 * than with everything the cap allows. The size is declared here so the value
 * the API documents and the value a service falls back to are one constant.
 */
export class SearchPaginationDto extends PaginationDto {
  @ApiProperty({
    required: false,
    minimum: 0,
    maximum: MAX_PAGE_SIZE,
    default: DEFAULT_SEARCH_PAGE_SIZE,
  })
  take?: number = DEFAULT_SEARCH_PAGE_SIZE;
}
