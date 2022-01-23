import { Injectable } from "@nestjs/common";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime";
import { PrismaError } from "../../prisma/prisma.constants";
import { PrismaService } from "../../prisma/prisma.service";
import { RegistrationNotFoundException } from "../exceptions";

@Injectable()
export class CommonRegistrationService {
  constructor(protected readonly prismaService: PrismaService) {}

  async findOne(event_id: string, user_id: string) {
    const registration = await this.prismaService.registrations.findUnique({
      where: { event_id_user_id: { event_id: event_id, user_id: user_id } },
    });

    return registration;
  }

  async remove(event_id: string, user_id: string) {
    try {
      return await this.prismaService.registrations.delete({
        where: { event_id_user_id: { event_id: event_id, user_id: user_id } },
      });
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === PrismaError.EntityNotFound
      ) {
        throw new RegistrationNotFoundException(event_id, user_id);
      } else {
        throw error;
      }
    }
  }
}
