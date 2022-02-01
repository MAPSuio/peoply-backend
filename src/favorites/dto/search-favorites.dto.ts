import { IsOptional, IsUUID } from "class-validator";
import { ToBoolean } from "../../../decorators/transformers";

export class SearchFavoritesDto {
  @IsOptional()
  @IsUUID(4)
  event_id: string;

  @IsOptional()
  @ToBoolean()
  include_event?: boolean;
}
