import { Injectable } from "@nestjs/common";
import { reg_status } from ".prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime";
import { SearchEventRegistrationDto } from "../../events/dto";
import { PrismaError } from "../../prisma/prisma.constants";
import { PrismaService } from "../../prisma/prisma.service";
import { ArrangerUpdateRegistrationDto } from "../dto";
import { RegistrationNotFoundException } from "../exceptions";
import { CommonRegistrationService } from "./common.registrations.service";

@Injectable()
export class ArrangerRegistrationService extends CommonRegistrationService {
  constructor(protected readonly prismaService: PrismaService) {
    super(prismaService);
  }

  async findAll(
    searchProps: SearchEventRegistrationDto,
    event_id: string,
    skip = 0,
    take = 10,
    orderBy = "reg_date",
    orderDirection = "asc",
  ) {
    return await this.prismaService.registrations.findMany({
      skip,
      take,
      where: {
        event_id: event_id,
        reg_status: searchProps.reg_status,
        attendance: searchProps.attendance,
      },
      include: {
        user: new Boolean(searchProps.include_users).valueOf()
          ? {
              select: {
                first_name: true,
                last_name: true,
                image: true,
              },
            }
          : false,
      },
      orderBy: {
        [orderBy]: orderDirection,
      },
    });
  }

  async findNumberAttending(event_id: string, reg_status: reg_status) {
    return this.prismaService.registrations.count({
      where: {
        event_id: event_id,
        reg_status: reg_status,
      },
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
        data: { ...arrangerUpdateRegistrationDto, event_id },
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
