import { BadRequestException, Injectable } from "@nestjs/common";
import { RegStatus } from ".prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime";
import {
  SearchEventRegistrationDto,
  SearchEventRegistrationCountDto,
} from "../../events/dto";
import { PrismaError } from "../../prisma/prisma.constants";
import { PrismaService } from "../../prisma/prisma.service";
import { ArrangerUpdateRegistrationDto } from "../dto";
import { RegistrationNotFoundException } from "../exceptions";
import { CommonRegistrationService } from "./common.registrations.service";
import { Registration } from ".prisma/client";
import { EventNotFoundException } from "../../events/exceptions";

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

    const eventHasFood = (
      await this.prismaService.event.findUnique({
        where: { id: eventId },
        select: { hasFood: true },
      })
    )?.hasFood;

    if (searchProps.regStatus) {
      return await this.prismaService.registration.findMany({
        where: { eventId: eventId, regStatus: searchProps.regStatus },
        skip,
        take,
        orderBy: { [orderBy]: orderDirection },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              image: true,
              foodPreference:
                searchProps.regStatus === RegStatus.GOING && eventHasFood,
            },
          },
        },
      });
    }

    const registrations = await this.prismaService.registration.findMany({
      skip,
      take,
      where: { eventId: eventId },
      orderBy: { [orderBy]: orderDirection },
      include: {
        user: new Boolean(searchProps.includeUsers).valueOf()
          ? {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                image: true,
                foodPreference: eventHasFood,
              },
            }
          : undefined,
      },
    });

    // remove foodPreference if not going
    return eventHasFood
      ? registrations.map((registration) => {
          if (registration.regStatus !== RegStatus.GOING) {
            registration.user.foodPreference = null;
          }
          return registration;
        })
      : registrations;
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

  async getRegistrationCount(
    searchProps: SearchEventRegistrationCountDto,
    eventId: string,
  ) {
    try {
      return await this.prismaService.registration.count({
        where: searchProps.regStatus
          ? { eventId: eventId, regStatus: searchProps.regStatus }
          : { eventId: eventId },
      });
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === PrismaError.EntityNotFound
      ) {
        throw new EventNotFoundException(eventId);
      } else {
        throw error;
      }
    }
  }
}
