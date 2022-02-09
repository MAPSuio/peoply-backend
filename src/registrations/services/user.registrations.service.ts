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

  async create(userId: string, createRegistrationDto: CreateRegistrationDto) {
    try {
      const registration = await this.prismaService.registration.create({
        data: { ...createRegistrationDto, userId },
      });
      return registration;
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
    orderBy = "regDate",
    orderDirection = "asc",
  ) {
    return await this.prismaService.registration.findMany({
      skip,
      take,
      where: {
        userId,
        regStatus: searchProps.regStatus,
        attendance: searchProps.attendance,
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
    UserUpdateRegistrationDto: UserUpdateRegistrationDto,
  ) {
    try {
      return await this.prismaService.registration.update({
        where: {
          eventId_userId: {
            eventId: UserUpdateRegistrationDto.eventId,
            userId,
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
          UserUpdateRegistrationDto.eventId,
          userId,
        );
      } else {
        throw error;
      }
    }
  }
}
