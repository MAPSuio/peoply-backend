import { Injectable } from "@nestjs/common";
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
