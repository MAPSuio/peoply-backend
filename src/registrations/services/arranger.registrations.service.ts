import { Injectable } from "@nestjs/common";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime";
import { SearchRegistrationDto } from "src/events/dto/search-registration-dto";
import { PrismaService } from "src/prisma.service";
import { ArrangerUpdateRegistrationDto } from "../dto/arranger-update-registration.dto";
import { RegistrationNotFoundException } from "../exceptions/registrationNotFound.exception";
import { CommonRegistrationService } from "./common.registration.service";

@Injectable()
export class ArrangerRegistrationService extends CommonRegistrationService {
  constructor(protected readonly prismaService: PrismaService) {
    super(prismaService);
  }

  async findAll(
    searchProps: SearchRegistrationDto,
    event_id: string,
    skip = 0,
    take = 10,
    orderBy = "reg_date",
    orderDirection = "asc",
  ) {
    console.log("inc er ", searchProps.include_users);
    const user_included = searchProps.include_users == true ? true : false;

    return await this.prismaService.registrations.findMany({
      skip,
      take,
      where: {
        event_id: event_id,
        reg_status: searchProps.reg_status,
        attendance: searchProps.attendance,
      },
      include: {
        user: user_included,
      },
      orderBy: {
        [orderBy]: orderDirection,
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
