import { Injectable } from "@nestjs/common";
import { CreateRegistrationDto } from "../dto/create-registration.dto";
import { UserUpdateRegistrationDto } from "../dto/user-update-registration.dto";
import { PrismaService } from "src/prisma.service";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime";
import { RegistrationNotFoundException } from "../exceptions/registrationNotFound.exception";
import { DuplicateRegistrationException } from "../exceptions/duplicateRegistration.exception";
import { ForeignKeyNotFoundException } from "../exceptions/foreignKeyNotFound.exception";
import { CommonRegistrationService } from "./common.registration.service";
import { SearchUserRegistrationDto } from "../dto/search-user-registration.dto";
import { PrismaError } from "src/prisma/prisma.constants";

@Injectable()
export class UserRegistrationService extends CommonRegistrationService {
  constructor(protected readonly prismaService: PrismaService) {
    super(prismaService);
  }

  async create(user_id: string, createRegistrationDto: CreateRegistrationDto) {
    createRegistrationDto.user_id = user_id;

    try {
      const registration = await this.prismaService.registrations.create({
        data: createRegistrationDto,
      });
      return registration;
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError) {
        if (error.code === PrismaError.DuplicateUniqueValue) {
          throw new DuplicateRegistrationException(
            createRegistrationDto.event_id,
            createRegistrationDto.user_id,
          );
        } else if (error.code === PrismaError.ForeignKeyFailed) {
          throw new ForeignKeyNotFoundException(
            createRegistrationDto.event_id,
            createRegistrationDto.user_id,
          );
        }
      }
      throw error;
    }
  }

  async findAll(
    searchProps: SearchUserRegistrationDto,
    user_id: string,
    skip = 0,
    take = 10,
    orderBy = "reg_date",
    orderDirection = "asc",
  ) {
    return await this.prismaService.registrations.findMany({
      skip,
      take,
      where: {
        user_id: user_id,
        reg_status: searchProps.reg_status,
        attendance: searchProps.attendance,
      },
      include: {
        event: new Boolean(searchProps.include_event).valueOf(),
      },
      orderBy: {
        [orderBy]: orderDirection,
      },
    });
  }

  async update(
    user_id: string,
    UserUpdateRegistrationDto: UserUpdateRegistrationDto,
  ) {
    try {
      return await this.prismaService.registrations.update({
        where: {
          event_id_user_id: {
            event_id: UserUpdateRegistrationDto.event_id,
            user_id: user_id,
          },
        },
        data: { ...UserUpdateRegistrationDto },
      });
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === PrismaError.EntityNotFound
      ) {
        //errorcode 'P2025' event not found in database
        throw new RegistrationNotFoundException(
          UserUpdateRegistrationDto.event_id,
          user_id,
        );
      } else {
        throw error;
      }
    }
  }
}
