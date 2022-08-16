import { BadRequestException, Injectable } from "@nestjs/common";
import { RegStatus } from ".prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime";
import { SearchEventRegistrationDto } from "../../events/dto";
import { PrismaError } from "../../prisma/prisma.constants";
import { PrismaService } from "../../prisma/prisma.service";
import { ArrangerUpdateRegistrationDto } from "../dto";
import { RegistrationNotFoundException } from "../exceptions";
import { CommonRegistrationService } from "./common.registrations.service";
import { Registration } from ".prisma/client";

@Injectable()
export class ArrangerRegistrationService extends CommonRegistrationService {
  constructor(protected readonly prismaService: PrismaService) {
    super(prismaService);
  }

  async findAll(
    searchProps: SearchEventRegistrationDto,
    eventId: string,
    skip = 0,
    take = 10,
    orderBy: keyof Registration = "updatedAt",
    orderDirection: "asc" | "desc" = "asc",
  ) {
    /* create a dummy object to type check runtime */
    const dummy: Registration = {
      eventId: "",
      userId: "",
      regStatus: RegStatus.GOING,
      updatedAt: new Date(),
      createdAt: new Date(),
    };
    /* Check if orderBy is a key of Registration */
    if (!Object.keys(dummy).includes(orderBy)) {
      throw new BadRequestException(`${orderBy} is not a key of Registration`);
    }

    return await this.prismaService.registration.findMany({
      skip,
      take,
      where: {
        eventId,
        regStatus: searchProps.regStatus,
      },
      include: {
        user: new Boolean(searchProps.includeUsers).valueOf()
          ? {
              select: {
                firstName: true,
                lastName: true,
                image: true,
                id: true,
              },
            }
          : false,
      },
      orderBy: {
        [orderBy]: orderDirection,
      },
    });
  }

  async findNumberAttending(eventId: string, regStatus: RegStatus) {
    return this.prismaService.registration.count({
      where: {
        eventId,
        regStatus,
      },
    });
  }

  async update(
    eventId: string,
    userId: string,
    arrangerUpdateRegistrationDto: ArrangerUpdateRegistrationDto,
  ) {
    try {
      return await this.prismaService.registration.update({
        where: { eventId_userId: { eventId, userId } },
        data: { ...arrangerUpdateRegistrationDto, eventId },
      });
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === PrismaError.EntityNotFound
      ) {
        throw new RegistrationNotFoundException(eventId, userId);
      } else {
        throw error;
      }
    }
  }
}
