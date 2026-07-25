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
    // P2002 (already favourited) -> 409 and P2003 (no such event or user)
    // -> 400, both handled by PrismaExceptionFilter.
    const registration = await this.prismaService.favorite.create({
      data: { eventId, userId },
    });
    return registration;
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
    // The catch this replaces had no condition at all: every failure became
    // "favorite does not exist", so a dropped connection reported 404.
    return await this.prismaService.favorite.delete({
      where: {
        eventId_userId: {
          userId,
          eventId,
        },
      },
    });
  }
}
