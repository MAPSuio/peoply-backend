import { Injectable } from "@nestjs/common";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime";
import { PrismaError } from "../prisma/prisma.constants";
import { PrismaService } from "../prisma/prisma.service";
import { SearchFavoritesDto } from "./dto/search-favorites.dto";
import { DuplicateFavoriteException } from "./exceptions/duplicateFavorite.exception";
import { FavoriteDoesNotExistException } from "./exceptions/favoriteDoesNotExist.exception";
import { ForeignKeyNotFoundException } from "./exceptions/foreignKeyNotFound";

@Injectable()
export class FavoritesService {
  constructor(private readonly prismaService: PrismaService) {}

  async create(user_id: string, event_id: string) {
    try {
      const registration = await this.prismaService.favorites.create({
        data: { event_id, user_id },
      });
      return registration;
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError) {
        if (error.code === PrismaError.DuplicateUniqueValue) {
          throw new DuplicateFavoriteException(event_id, user_id);
        } else if (error.code === PrismaError.ForeignKeyFailed) {
          throw new ForeignKeyNotFoundException(event_id, user_id);
        }
      }
      throw error;
    }
  }

  async findAll(
    searchProps: SearchFavoritesDto,
    user_id: string,
    skip = 0,
    take = 10,
    orderBy = "favorite_date",
    orderDirection = "asc",
  ) {
    return await this.prismaService.favorites.findMany({
      skip,
      take,
      where: {
        user_id: user_id,
      },
      include: {
        event: new Boolean(searchProps.include_event).valueOf(),
      },
      orderBy: {
        [orderBy]: orderDirection,
      },
    });
  }

  async findOne(user_id: string, event_id: string) {
    return await this.prismaService.favorites.findUnique({
      where: {
        event_id_user_id: { event_id: event_id, user_id: user_id },
      },
    });
  }

  async remove(user_id: string, event_id: string) {
    try {
      return await this.prismaService.favorites.delete({
        where: {
          event_id_user_id: {
            user_id: user_id,
            event_id: event_id,
          },
        },
      });
    } catch (error) {
      throw new FavoriteDoesNotExistException(user_id, event_id);
    }
  }
}
