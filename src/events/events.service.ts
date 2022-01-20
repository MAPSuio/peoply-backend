import { Injectable } from "@nestjs/common";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime";
import { ArrangersService } from "src/arrangers/arrangers.service";
import { ArrangerNotFoundException } from "src/arrangers/exceptions/arrangerNotFound.exception";
import { PrismaService } from "../prisma.service";
import { CreateEventDto } from "./dto/create-event.dto";
import { SearchEventDto } from "./dto/search-event.dto";
import { UpdateEventDto } from "./dto/update-event.dto";
import { EventNotFoundException } from "./exceptions/eventNotFound.exception";
import { v4 as uuidv4 } from "uuid";
import { event_arranger_roles } from "@prisma/client";

@Injectable()
export class EventsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly arrangersService: ArrangersService,
  ) {}

  async create(createEventDto: CreateEventDto, arranger_id: string) {
    const arranger = await this.arrangersService.findOne(arranger_id);
    if (!arranger) {
      throw new ArrangerNotFoundException(arranger_id);
    }

    const eventId = uuidv4();
    const [event] = await this.prismaService.$transaction([
      this.prismaService.events.create({
        data: { event_id: eventId, ...createEventDto },
      }),
      this.prismaService.event_arrangers.create({
        data: {
          role: event_arranger_roles.ADMIN,
          arranger_id,
          event_id: eventId,
        },
      }),
    ]);
    return event;
  }

  async findAll(
    searchProps: SearchEventDto = {},
    skip = 0,
    take = 10,
    orderBy = "start_date",
    orderDirection = "asc",
  ) {
    return await this.prismaService.events.findMany({
      skip,
      take,
      where: {
        event_numeric_id: searchProps.event_id,
        start_date: {
          gte: searchProps.afterDate,
          lte: searchProps.beforeDate,
        },
        title: searchProps.title ? { search: searchProps.title } : undefined,
        description: searchProps.description
          ? { search: searchProps.description }
          : undefined,
        capacity: searchProps.capacity,
        private: false,

        // find arranger if specified
        // if not specified, but user is, then find arranger using user_id
        // if not specified, but organization is, then find arranger using organization_id
        event_arrangers:
          searchProps.arranger_id ||
          searchProps.user_id ||
          searchProps.organization_id
            ? {
                every: {
                  arranger: searchProps.arranger_id
                    ? { arranger_id: searchProps.arranger_id }
                    : {
                        user: searchProps.user_id
                          ? { user_id: searchProps.user_id }
                          : undefined,
                        organization: searchProps.organization_id
                          ? { organization_id: searchProps.organization_id }
                          : undefined,
                      },
                },
              }
            : undefined,
      },
      orderBy: {
        [orderBy]: orderDirection,
      },
    });
  }

  async findOne(id: number) {
    const event = await this.prismaService.events.findUnique({
      where: { event_numeric_id: id },
    });

    if (!event) {
      throw new EventNotFoundException(id);
    } else {
      return event;
    }
  }

  async findOneWithEventArrangers(id: number) {
    const event = await this.prismaService.events.findUnique({
      where: { event_numeric_id: id },
      include: {
        event_arrangers: true,
      },
    });

    if (!event) {
      throw new EventNotFoundException(id);
    } else {
      return event;
    }
  }

  async update(id: number, updateEventDto: UpdateEventDto) {
    try {
      return await this.prismaService.events.update({
        where: { event_numeric_id: id },
        data: { ...updateEventDto },
      });
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === prismaError.EntityNotFound
      ) {
        //errorcode 'P2025' event not found in database
        throw new EventNotFoundException(id);
      } else {
        throw error;
      }
    }
  }

  async remove(id: number) {
    try {
      return await this.prismaService.events.delete({
        where: { event_numeric_id: id },
      });
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === prismaError.EntityNotFound
      ) {
        //errorcode 'P2025' event not found in database
        throw new EventNotFoundException(id);
      } else {
        throw error;
      }
    }
  }
}
