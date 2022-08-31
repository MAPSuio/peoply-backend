import { BadRequestException, Injectable } from "@nestjs/common";
import { Favorite } from ".prisma/client";
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

  async create(userId: string, eventId: string) {
    try {
      const registration = await this.prismaService.favorite.create({
        data: { eventId, userId },
      });
      return registration;
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError) {
        if (error.code === PrismaError.DuplicateUniqueValue) {
          throw new DuplicateFavoriteException(eventId, userId);
        } else if (error.code === PrismaError.ForeignKeyFailed) {
          throw new ForeignKeyNotFoundException(eventId, userId);
        }
      }
      throw error;
    }
  }

  async findAll(
    searchProps: SearchFavoritesDto,
    userId: string,
    skip = 0,
    take = 10,
    orderBy: keyof Favorite = "updatedAt",
    orderDirection: "asc" | "desc" = "asc",
  ) {
    /* create a dummy object to type check runtime */
    const dummy: Favorite = {
      eventId: "",
      userId: "",
      updatedAt: new Date(),
      createdAt: new Date(),
    };
    /* Check if orderBy is a key of Registration */
    if (!Object.keys(dummy).includes(orderBy)) {
      throw new BadRequestException(`${orderBy} is not a key of Registration`);
    }

    return await this.prismaService.favorite.findMany({
      skip,
      take,
      where: {
        userId,
      },
      include: {
        event: new Boolean(searchProps.includeEvent).valueOf() && {
          include: {
            eventArrangers: new Boolean(
              searchProps.includeArrangers,
            ).valueOf() && {
              include: {
                arranger: {
                  include: {
                    user: {
                      select: {
                        firstName: true,
                        lastName: true,
                        image: true,
                      },
                    },
                    organization: { select: { name: true, image: true } },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        [orderBy]: orderDirection,
      },
    });
  }

  async findOne(userId: string, eventId: string) {
    return await this.prismaService.favorite.findUnique({
      where: {
        eventId_userId: { eventId, userId },
      },
    });
  }

  async remove(userId: string, eventId: string) {
    try {
      return await this.prismaService.favorite.delete({
        where: {
          eventId_userId: {
            userId,
            eventId,
          },
        },
      });
    } catch (error) {
      throw new FavoriteDoesNotExistException(userId, eventId);
    }
  }
}
