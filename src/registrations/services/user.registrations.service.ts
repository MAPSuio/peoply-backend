import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime";
import { CommonRegistrationService } from "./common.registrations.service";
import { PrismaService } from "../../prisma/prisma.service";
import { PrismaError } from "../../prisma/prisma.constants";
import {
  CreateRegistrationDto,
  SearchUserRegistrationDto,
  UserUpdateRegistrationDto,
} from "../dto";
import {
  DuplicateRegistrationException,
  ForeignKeyNotFoundException,
  RegistrationNotFoundException,
} from "../exceptions";
import { RegStatus, Registration } from ".prisma/client";
import { EventNotFoundException } from "../../events/exceptions";

@Injectable()
export class UserRegistrationService extends CommonRegistrationService {
  constructor(prismaService: PrismaService) {
    super(prismaService);
  }

  async create(userId: string, createRegistrationDto: CreateRegistrationDto) {
    try {
      if (createRegistrationDto.regStatus === RegStatus.GOING) {
        return this.prismaService.$transaction(async (trx) => {
          const event = await trx.event.findUnique({
            where: { id: createRegistrationDto.eventId },
            include: {
              registrations: { where: { regStatus: RegStatus.GOING } },
            },
          });

          if (event) {
            if (
              event.capacity === null ||
              event.registrations.length < event.capacity
            ) {
              return trx.registration.create({
                data: { ...createRegistrationDto, userId },
              });
            } else {
              return trx.registration.create({
                data: {
                  eventId: createRegistrationDto.eventId,
                  userId,
                  regStatus: RegStatus.WAITLISTED,
                },
              });
            }
          } else {
            throw new EventNotFoundException();
          }
        });
      } else if (createRegistrationDto.regStatus === RegStatus.INVITED) {
        return this.prismaService.registration.create({
          data: { ...createRegistrationDto, userId },
        });
      } else {
        /* Not possible to create with NOT_GOING_ since this only makes sense if invited */
        /* Also not possible with WAITLISTED, since this is handled in GOING case */
        throw new BadRequestException("Invalid registration status");
      }
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError) {
        if (error.code === PrismaError.DuplicateUniqueValue) {
          throw new DuplicateRegistrationException(
            createRegistrationDto.eventId,
            userId,
          );
        } else if (error.code === PrismaError.ForeignKeyFailed) {
          throw new ForeignKeyNotFoundException(
            createRegistrationDto.eventId,
            userId,
          );
        }
      }
      throw error;
    }
  }

  async findAll(
    searchProps: SearchUserRegistrationDto,
    userId: string,
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
        userId,
        regStatus: searchProps.regStatus,
      },
      include: {
        event: new Boolean(searchProps.includeEvent).valueOf(),
      },
      orderBy: {
        [orderBy]: orderDirection,
      },
    });
  }

  async update(
    userId: string,
    userUpdateRegistrationDto: UserUpdateRegistrationDto,
  ) {
    try {
      const registration = this.prismaService.$transaction(async (trx) => {
        const event = await trx.event.findUnique({
          where: { id: userUpdateRegistrationDto.eventId },
          include: {
            registrations: { orderBy: { updatedAt: "asc" } },
          },
        });

        const existingReg = event?.registrations.find(
          (registration) =>
            registration.eventId === userUpdateRegistrationDto.eventId &&
            registration.userId === userId,
        );

        if (event && existingReg) {
          const going = event.registrations.filter(
            (registration) => registration.regStatus === RegStatus.GOING,
          );

          /* If change from NOT_GOING to GOING */
          if (
            userUpdateRegistrationDto.regStatus === RegStatus.GOING &&
            (existingReg.regStatus === RegStatus.NOT_GOING ||
              existingReg.regStatus === RegStatus.INVITED)
          ) {
            /* If event has no capacity or if there is free space
             * Just update registration status
             */
            if (event.capacity === null || going.length < event.capacity) {
              return trx.registration.update({
                where: {
                  eventId_userId: {
                    eventId: userUpdateRegistrationDto.eventId,
                    userId,
                  },
                },
                data: {
                  regStatus: userUpdateRegistrationDto.regStatus,
                },
              });

              /* Else add to waitlist */
            } else {
              return trx.registration.update({
                where: {
                  eventId_userId: {
                    eventId: userUpdateRegistrationDto.eventId,
                    userId,
                  },
                },
                data: {
                  regStatus: RegStatus.WAITLISTED,
                },
              });
            }

            /* If change from GOING to NOT_GOING
             * Check if there is anyone on waitlist
             */
          } else if (
            userUpdateRegistrationDto.regStatus === RegStatus.NOT_GOING &&
            existingReg.regStatus === RegStatus.GOING
          ) {
            const waitlisted = event.registrations.filter(
              (registration) => registration.regStatus === RegStatus.WAITLISTED,
            );

            /* Get current registration */
            const registration = trx.registration.update({
              where: {
                eventId_userId: {
                  eventId: userUpdateRegistrationDto.eventId,
                  userId,
                },
              },
              data: {
                regStatus: userUpdateRegistrationDto.regStatus,
              },
            });

            /* If there is someone in waitlist, give space to first on waitlist */
            if (waitlisted.length !== 0) {
              const nextGoing = waitlisted[0];

              await trx.registration.update({
                where: {
                  eventId_userId: {
                    eventId: userUpdateRegistrationDto.eventId,
                    userId: nextGoing.userId,
                  },
                },
                data: {
                  regStatus: RegStatus.GOING,
                },
              });
            }
            return registration;
          }
        } else {
          throw new ForeignKeyNotFoundException(
            userUpdateRegistrationDto.eventId,
            userId,
          );
        }
      });
      return registration;
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === PrismaError.EntityNotFound
      ) {
        //errorcode 'P2025' event not found in database
        throw new RegistrationNotFoundException(
          userUpdateRegistrationDto.eventId,
          userId,
        );
      } else {
        throw error;
      }
    }
  }
}
