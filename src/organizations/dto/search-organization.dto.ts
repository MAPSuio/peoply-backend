import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsOptional, IsString, MaxLength } from "class-validator";
import { ToArray } from "../../../decorators/transformers/string.to.array";
import { PaginationDto } from "../../util/pagination.dto";

export class SearchOrganizationDto extends PaginationDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @ApiProperty({ required: false })
  name?: string;

  @IsOptional()
  @ToArray()
  @IsArray()
  @ApiProperty({ required: false })
  orgNrs?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @ApiProperty({ required: false })
  description?: string;
}
