import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";
import { MAX_PAGE_SIZE } from "./pagination";

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
