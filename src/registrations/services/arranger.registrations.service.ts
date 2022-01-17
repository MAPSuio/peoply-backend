import { Injectable } from "@nestjs/common";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime";
import { PrismaService } from "src/prisma.service";
import { ArrangerUpdateRegistrationDto } from "../dto/arranger-update-registration.dto";
import { RegistrationNotFoundException } from "../exceptions/registrationNotFound.exception";
import { CommonRegistrationService } from "./common.registration.service";

@Injectable()
export class ArrangerRegistrationService extends CommonRegistrationService {
  constructor(protected readonly prismaService: PrismaService) {
    super(prismaService);
  }

  async findAll(event_id: string) {
    return await this.prismaService.registrations.findMany({
      where: { event_id: event_id },
    });
  }

  async update(
    event_id: string,
    user_id: string,
    arrangerUpdateRegistrationDto: ArrangerUpdateRegistrationDto,
  ) {
    try {
      return await this.prismaService.registrations.update({
        where: { event_id_user_id: { event_id: event_id, user_id: user_id } },
        data: { ...arrangerUpdateRegistrationDto },
      });
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        //errorcode 'P2025' event not found in database
        throw new RegistrationNotFoundException(event_id, user_id);
      } else {
        throw error;
      }
    }
  }
}
