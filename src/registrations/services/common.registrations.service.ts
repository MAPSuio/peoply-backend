import { Injectable } from "@nestjs/common";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime";
import { PrismaError } from "../../prisma/prisma.constants";
import { PrismaService } from "../../prisma/prisma.service";
import { RegistrationNotFoundException } from "../exceptions";

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
      return await this.prismaService.registration.delete({
        where: { eventId_userId: { eventId, userId } },
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
