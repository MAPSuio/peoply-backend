import { IsOptional, IsUUID } from "class-validator";
import { ToBoolean } from "../../../decorators/transformers";

export class SearchFavoritesDto {
  @IsOptional()
  @IsUUID(4)
  eventId: string;

  @IsOptional()
  @ToBoolean()
  includeEvent?: boolean;
}
