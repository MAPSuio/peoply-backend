import { Prisma, RegStatus } from "../../generated/prisma/client";
import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsOptional } from "class-validator";
import { ToBoolean } from "../../../decorators/transformers";
import { PagedQueryDto } from "../../util/paged-query.dto";

export class SearchEventRegistrationDto extends PagedQueryDto(
  Prisma.RegistrationScalarFieldEnum,
) {
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
  includeUsers?: boolean;
}
