import { RegStatus } from "../../generated/prisma/client";
import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, Max, Min } from "class-validator";
import { ToBoolean } from "../../../decorators/transformers";
import { MAX_PAGE_SIZE } from "../../util/pagination";

export class SearchUserRegistrationDto {
  @IsOptional()
  @IsEnum(RegStatus)
  @ApiProperty({ required: false })
  regStatus?: RegStatus;

  @IsOptional()
  @ToBoolean()
  @ApiProperty({ required: false })
  attendance?: boolean;

  @IsOptional()
  @ToBoolean()
  @ApiProperty({ required: false })
  includeEvent?: boolean;

  @IsOptional()
  @ToBoolean()
  @ApiProperty({ required: false })
  includeArrangers?: boolean;

  // `skip` is an offset, not a page number: 0 is the first page. @Min(1) here
  // meant GET /users/:userId/registrations?skip=0 answered 400, on the one
  // paginated endpoint of five that had drifted from @Min(0).
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
