import { RegStatus } from ".prisma/client";
import { Injectable } from "@nestjs/common";
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
}
