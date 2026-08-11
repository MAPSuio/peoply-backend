import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

/** A year is already far beyond what these dashboards ask for. */
const MAX_DAYS = 3650;
const DEFAULT_DAYS = 30;

/**
 * Every moderation info route takes the same `days` window, and each one feeds
 * it straight into `Date.now() - days * 86_400_000`. Declared once so none of
 * them can be added later without the bounds.
 *
 * Without validation `days=abc` became `NaN`, `new Date(NaN)` an Invalid Date,
 * and Prisma answered with a 500 rather than a 400.
 */
export class ModerationRangeDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_DAYS)
  @ApiProperty({
    required: false,
    default: DEFAULT_DAYS,
    minimum: 1,
    maximum: MAX_DAYS,
  })
  days: number = DEFAULT_DAYS;
}
