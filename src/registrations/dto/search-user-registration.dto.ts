import { ApiProperty } from "@nestjs/swagger";
import { IsOptional } from "class-validator";
import { ToBoolean } from "../../../decorators/transformers";
import { SearchRegistrationDto } from "./search-registration.dto";

export class SearchUserRegistrationDto extends SearchRegistrationDto {
  @IsOptional()
  @ToBoolean()
  @ApiProperty({ required: false })
  includeEvent?: boolean;

  @IsOptional()
  @ToBoolean()
  @ApiProperty({ required: false })
  includeArrangers?: boolean;
}
