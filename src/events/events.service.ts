import { Injectable } from "@nestjs/common";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime";
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
    return await this.prismaService.events.findMany();
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
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === "P2025"
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
        where: { event_id: id },
      });
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        //errorcode 'P2025' event not found in database
        throw new EventNotFoundException(id);
      } else {
        throw error;
      }
    }
  }
}
