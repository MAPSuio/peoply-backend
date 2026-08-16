import { ApiProperty } from "@nestjs/swagger";
import { IsOptional } from "class-validator";
import { ToBoolean } from "../../../decorators/transformers";
import { SearchRegistrationDto } from "../../registrations/dto/search-registration.dto";

export class SearchEventRegistrationDto extends SearchRegistrationDto {
  @IsOptional()
  @ToBoolean()
  @ApiProperty({ required: false })
  includeUsers?: boolean;
}
