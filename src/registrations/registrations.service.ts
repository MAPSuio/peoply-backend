import { Injectable } from "@nestjs/common";
import { CreateRegistrationDto } from "./dto/create-registration.dto";
import { UpdateRegistrationDto } from "./dto/update-registration.dto";
import { PrismaService } from "src/prisma.service";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime";
import { EventNotFoundException } from "src/events/exceptions/eventNotFound.exception";
import { RegistrationsNotFoundException } from "./exceptions/registrationsNotFound.exception";

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

  // findAll() {
  //   return `This action returns all registrations`;
  // }

  // findOne(id: number) {
  //   return `This action returns a #${id} registration`;
  // }

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
        throw new RegistrationsNotFoundException(event_id, user_id);
      } else {
        throw error;
      }
    }
  }

  // remove(id: number) {
  //   return `This action removes a #${id} registration`;
  // }
}
