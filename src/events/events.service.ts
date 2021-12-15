import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma.service";
import { CreateEventDto } from "./dto/create-event.dto";
import { UpdateEventDto } from "./dto/update-event.dto";
import { EventNotFoundException } from "./exceptions/eventNotFound.exception";
// import { UpdateEventDto } from "./dto/update-event.dto";

@Injectable()
export class EventsService {
  constructor(private readonly prismaService: PrismaService) {}

  async create(createEventDto: CreateEventDto) {
    const update = await this.prismaService.events.create({
      data: createEventDto,
    });
    return update;
  }

  // findAll() {
  //   return `This action returns all events`;
  // }

  // findOne(id: number) {
  //   return `This action returns a #${id} event`;
  // }

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

  // remove(id: number) {
  //   return `This action removes a #${id} event`;
  // }
}
