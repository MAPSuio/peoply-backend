import { RegStatus } from "../../generated/prisma/client";
import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsOptional } from "class-validator";
import { ToBoolean } from "../../../decorators/transformers";
import { PaginationDto } from "../../util/pagination.dto";

export class SearchUserRegistrationDto extends PaginationDto {
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
}
