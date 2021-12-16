import { Injectable } from "@nestjs/common";
import { CreateRegistrationDto } from "./dto/create-registration.dto";
import { UpdateRegistrationDto } from "./dto/update-registration.dto";
import { PrismaService } from "src/prisma.service";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime";
import { RegistrationNotFoundException } from "./exceptions/registrationNotFound.exception";

@Injectable()
export class RegistrationsService {
  constructor(private readonly prismaService: PrismaService) {}

  async create(createRegistrationDto: CreateRegistrationDto) {
    //TODO: should be done by default in the database, not here in the backend.
    createRegistrationDto.attendance = false;
    createRegistrationDto.reg_date = new Date("2021-07-08T14:00:00.434Z");
    const reg = await this.prismaService.registrations.create({
      data: createRegistrationDto,
    });
    return reg;
  }

  async findAll() {
    const user_id = "5e7ed477-229d-43b2-ae0a-a7694ff44ac0"; //hardcoded for testing purposes.

    //If a user has no registrations an empty list is returned
    return await this.prismaService.registrations.findMany({
      where: { user_id: user_id },
    });
  }

  async findOne(event_id: number) {
    const user_id = "5e7ed477-229d-43b2-ae0a-a7694ff44ac0"; //hardcoded for testing purposes.

    const registration = await this.prismaService.registrations.findUnique({
      where: { event_id_user_id: { event_id: event_id, user_id: user_id } },
    });

    if (!registration) {
      throw new RegistrationNotFoundException(event_id, user_id);
    } else {
      return registration;
    }
  }

  async update(
    event_id: number,
    user_id: string,
    updateRegistrationDto: UpdateRegistrationDto,
  ) {
    try {
      return await this.prismaService.registrations.update({
        where: { event_id_user_id: { event_id: event_id, user_id: user_id } },
        data: { ...updateRegistrationDto },
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

  async remove(event_id: number, user_id: string) {
    try {
      return await this.prismaService.registrations.delete({
        where: { event_id_user_id: { event_id: event_id, user_id: user_id } },
      });
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        throw new RegistrationNotFoundException(event_id, user_id);
      } else {
        throw error;
      }
    }
  }
}
