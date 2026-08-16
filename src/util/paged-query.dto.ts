import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsIn, IsOptional, IsString } from "class-validator";
import { PrismaOrderDirections } from "../prisma/prisma.constants";
import { PaginationDto } from "./pagination.dto";

/**
 * Base class for search DTOs whose endpoint sorts by a caller-chosen column:
 * `skip`/`take` bounds from {@link PaginationDto} plus `orderBy`/
 * `orderDirection` validated against the model's own columns.
 *
 * `orderBy` reaches Prisma as `orderBy: { [orderBy]: orderDirection }`, so any
 * non-column name — a relation such as `eventArrangers`, or anything at all —
 * makes Prisma raise a validation error that PrismaExceptionFilter does not
 * catch: a 500 and log noise on demand. The column list is checked against
 * Prisma's generated `*ScalarFieldEnum` rather than a hand-written literal, so
 * it cannot drift from the schema.
 *
 * It is a factory rather than four copies because the copies drifted: three
 * services validated `orderBy` against a hand-maintained dummy object at
 * runtime, and one of them had already been copy-pasted onto the wrong model
 * (`Favorite` rejecting with "not a key of Registration").
 *
 * Usage: `class SearchFooDto extends PagedQueryDto(Prisma.FooScalarFieldEnum)`.
 * The service reads the whole query object and applies its own defaults.
 */
export function PagedQueryDto(scalarFieldEnum: Record<string, string>) {
  const scalarFields = Object.keys(scalarFieldEnum);

  class PagedQuery extends PaginationDto {
    @IsOptional()
    @IsString()
    @IsIn(scalarFields, {
      message: `orderBy must be one of the model's own columns: ${scalarFields.join(", ")}`,
    })
    @ApiProperty({ required: false, enum: scalarFields })
    orderBy?: string;

    @IsOptional()
    @IsString()
    @IsEnum(PrismaOrderDirections, {
      message:
        "Must be either one of the values: '" +
        PrismaOrderDirections.ASC +
        "' or '" +
        PrismaOrderDirections.DESC +
        "'",
    })
    @ApiProperty({ required: false, enum: PrismaOrderDirections })
    orderDirection?: "asc" | "desc";
  }

  return PagedQuery;
}
