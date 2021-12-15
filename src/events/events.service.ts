import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";
import { CreateEventDto } from "./dto/create-event.dto";
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

  async findAll() {
    return this.prismaService.events.findMany();
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
