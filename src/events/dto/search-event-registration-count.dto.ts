import { PickType } from "@nestjs/swagger";
import { SearchRegistrationDto } from "../../registrations/dto/search-registration.dto";

export class SearchEventRegistrationCountDto extends PickType(
  SearchRegistrationDto,
  ["regStatus"] as const,
) {}
