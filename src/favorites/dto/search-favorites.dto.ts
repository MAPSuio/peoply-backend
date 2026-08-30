import { IsOptional, IsUUID } from "class-validator";
import { ToBoolean } from "../../../decorators/transformers";
import { Prisma } from "../../generated/prisma/client";
import { PagedQueryDto } from "../../util/paged-query.dto";

export class SearchFavoritesDto extends PagedQueryDto(
  Prisma.FavoriteScalarFieldEnum,
) {
  @IsOptional()
  @IsUUID(4)
  eventId?: string;

  @IsOptional()
  @ToBoolean()
  includeEvent?: boolean;

  @IsOptional()
  @ToBoolean()
  includeArrangers?: boolean;
}
