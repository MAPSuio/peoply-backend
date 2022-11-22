import { RegStatus } from ".prisma/client";
import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime";
import { PrismaError } from "../../prisma/prisma.constants";
import { PrismaService } from "../../prisma/prisma.service";
import {
  ForeignKeyNotFoundException,
  RegistrationNotFoundException,
} from "../exceptions";

@Injectable()
export class CommonRegistrationService {
  constructor(protected readonly prismaService: PrismaService) {}

  async findOne(eventId: string, userId: string) {
    const registration = await this.prismaService.registration.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });

    return registration;
  }

  async remove(eventId: string, userId: string) {
    try {
      const registration = await this.prismaService.$transaction(
        async (trx) => {
          const event = await trx.event.findUnique({
            where: { id: eventId },
            include: { registrations: { orderBy: { updatedAt: "asc" } } },
          });

          if (event?.regStart && new Date() < event.regStart) {
            throw new Error("Registration is not open yet");
          }

          if (event?.regEnd && new Date() > event.regEnd) {
            throw new Error("Registration closed");
          }

          const existingReg = event?.registrations.find(
            (reg) => reg.userId === userId && reg.eventId === eventId,
          );

          if (event && existingReg) {
            const reg = await trx.registration.delete({
              where: { eventId_userId: { eventId, userId } },
            });

            if (existingReg.regStatus === RegStatus.GOING) {
              const waitlisted = event.registrations.filter(
                (reg) => reg.regStatus === RegStatus.WAITLISTED,
              );

              if (waitlisted.length !== 0) {
                const nextGoing = waitlisted[0];

                await trx.registration.update({
                  where: {
                    eventId_userId: {
                      eventId: nextGoing.eventId,
                      userId: nextGoing.userId,
                    },
                  },
                  data: { regStatus: RegStatus.GOING },
                });
              }
            }

            return reg;
          } else {
            throw new ForeignKeyNotFoundException(eventId, userId);
          }
        },
      );

      return registration;
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

  async updateRegistration(
    userId: string,
    eventId: string,
    regStatus: RegStatus,
    formAnswer?: string,
  ) {
    try {
      const registration = this.prismaService.$transaction(async (trx) => {
        const event = await trx.event.findUnique({
          where: { id: eventId },
          include: {
            registrations: { orderBy: { updatedAt: "asc" } },
          },
        });

        if (event?.endDate && new Date() > event.endDate) {
          throw new BadRequestException("Event has ended");
        }

        if (event?.regStart && new Date() < event.regStart) {
          throw new BadRequestException("Registration has not opened yet");
        }

        if (event?.regEnd && new Date() > event.regEnd) {
          throw new BadRequestException("Registration has closed");
        }

        const existingReg = event?.registrations.find(
          (registration) =>
            registration.eventId === eventId && registration.userId === userId,
        );

        if (event && existingReg) {
          const going = event.registrations.filter(
            (registration) => registration.regStatus === RegStatus.GOING,
          );

          /* If change from NOT_GOING to GOING */
          if (
            regStatus === RegStatus.GOING &&
            (existingReg.regStatus === RegStatus.NOT_GOING ||
              existingReg.regStatus === RegStatus.INVITED)
          ) {
            /* If event has no capacity or if there is free space
             * Just update registration status
             */
            if (event.formQuestion && !formAnswer) {
              throw new BadRequestException(
                "Form answer is required for this event",
              );
            }

            if (event.capacity === null || going.length < event.capacity) {
              return trx.registration.update({
                where: {
                  eventId_userId: {
                    eventId: eventId,
                    userId,
                  },
                },
                data: {
                  regStatus: regStatus,
                  formAnswer,
                },
              });

              /* Else add to waitlist */
            } else {
              return trx.registration.update({
                where: {
                  eventId_userId: {
                    eventId: eventId,
                    userId,
                  },
                },
                data: {
                  regStatus: RegStatus.WAITLISTED,
                  formAnswer,
                },
              });
            }

            /* If change from GOING to NOT_GOING
             * Check if there is anyone on waitlist
             */
          } else if (
            (regStatus === RegStatus.NOT_GOING ||
              regStatus === RegStatus.BANNED) &&
            existingReg.regStatus === RegStatus.GOING
          ) {
            const waitlisted = event.registrations.filter(
              (registration) => registration.regStatus === RegStatus.WAITLISTED,
            );

            /* Get current registration */
            const registration = trx.registration.update({
              where: {
                eventId_userId: {
                  eventId: eventId,
                  userId,
                },
              },
              data: {
                regStatus: regStatus,
                formAnswer: null,
              },
            });

            /* If there is someone in waitlist, give space to first on waitlist */
            if (waitlisted.length !== 0) {
              const nextGoing = waitlisted[0];

              await trx.registration.update({
                where: {
                  eventId_userId: {
                    eventId: eventId,
                    userId: nextGoing.userId,
                  },
                },
                data: {
                  regStatus: RegStatus.GOING,
                },
              });
            }
            return registration;
          } else if (
            regStatus === RegStatus.NOT_GOING &&
            existingReg.regStatus === RegStatus.WAITLISTED
          ) {
            return trx.registration.update({
              where: {
                eventId_userId: {
                  eventId: eventId,
                  userId,
                },
              },
              data: {
                regStatus: regStatus,
                formAnswer: null,
              },
            });
          }
        } else {
          throw new ForeignKeyNotFoundException(eventId, userId);
        }
      });
      return registration;
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === PrismaError.EntityNotFound
      ) {
        //errorcode 'P2025' event not found in database
        throw new RegistrationNotFoundException(eventId, userId);
      } else {
        throw error;
      }
    }
  }
}
