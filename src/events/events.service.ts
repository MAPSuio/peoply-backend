import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { CreateEventDto } from "./dto/create-event.dto";
import { SearchEventDto } from "./dto/search-event-dto";
import { UpdateEventDto } from "./dto/update-event.dto";
import { EventNotFoundException } from "./exceptions/eventNotFound.exception";

@Injectable()
export class EventsService {
  constructor(private readonly prismaService: PrismaService) {}

  async create(createEventDto: CreateEventDto) {
    const update = await this.prismaService.events.create({
      data: createEventDto,
    });
    return update;
  }

  async findAll(searchProps: SearchEventDto = {}, skip = 0, take = 10) {
    return await this.prismaService.events.findMany({
      skip,
      take,
      where: {
        event_id: searchProps.event_id,
        // start_date: searchProps.start_date,
        // end_date: searchProps.end_date,
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
    });
  }

  async findOne(id: number) {
    const event = await this.prismaService.events.findUnique({
      where: { event_id: id },
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
        where: { event_id: id },
        data: { ...updateEventDto },
      });
    } catch (error) {
      throw new EventNotFoundException(id);
    }
  }

  async remove(id: number) {
    try {
      return await this.prismaService.events.delete({
        where: { event_id: id },
      });
    } catch (error) {
      throw new EventNotFoundException(id);
    }
  }
}
