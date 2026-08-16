import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsOptional } from "class-validator";
import { ToBoolean } from "../../../decorators/transformers";
import { Prisma, RegStatus } from "../../generated/prisma/client";
import { PagedQueryDto } from "../../util/paged-query.dto";

/** The filters every registration search takes, plus paging and ordering. */
export class SearchRegistrationDto extends PagedQueryDto(
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
}
