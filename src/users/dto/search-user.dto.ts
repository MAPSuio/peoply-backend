import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { MAX_PAGE_SIZE } from "../../util/pagination";
import { SearchPaginationDto } from "../../util/pagination.dto";
import { MaxSearchTokens } from "../../../decorators/validators/maxSearchTokens.validator";

/** Ten pages of the largest allowed page size. */
const MAX_SKIP = MAX_PAGE_SIZE * 10;

export class SearchUserDto extends SearchPaginationDto {
  /* Every whitespace-separated token becomes its own AND group, each holding
     up to eight `ILIKE` predicates (four spelling variants x firstName and
     lastName). With no upper bound a ~9 KB query built roughly 20 000
     predicates against the users table from a single request: measured 922 ms
     against a 30-row dev table, versus 64 ms for a normal one. That is one
     cheap request per 100/min of throttle, and the cost is all database.

     100 characters is well above any real name and caps the token count on its
     own, but MaxSearchTokens states the real limit rather than leaving it as an
     accident of the length. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @MaxSearchTokens(10)
  name?: string;

  /* `take` was capped and `skip` was not, so paging straight through the whole
     user table was a matter of walking skip upwards. The cap is generous enough
     to reach anyone through search but stops the endpoint being a bulk export.

     Every rule is restated rather than only adding @Max on top of the inherited
     ones: overriding a property makes class-validator use the subclass's
     metadata for it, so the inherited @Min(0) would quietly stop applying and a
     negative skip would validate. pagination.spec.ts is what catches that. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_SKIP)
  @Type(() => Number)
  @ApiProperty({ required: false, maximum: MAX_SKIP })
  declare skip?: number;
}
