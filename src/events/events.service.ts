import { Injectable } from "@nestjs/common";
import { validate } from "class-validator";
import { PrismaService } from "src/prisma.service";
import { CreateEventDto } from "./dto/create-event.dto";
import { UpdateEventDto } from "./dto/update-event.dto";
// import { UpdateEventDto } from "./dto/update-event.dto";

@Injectable()
export class EventsService {
  constructor(private readonly prismaService: PrismaService) {}

  async create(createEventDto: CreateEventDto) {
    const update = await this.prismaService.events.create({
      data: createEventDto,
    });
    return update;
    // console.log("creating update");

    // validate(update).then((errors) => {
    //   if (errors.length > 0) {
    //     console.log("creation failed: ", errors);
    //   } else {
    //     console.log("creation succeeded");
    //     return update;
    //   }
    // });
  }

  // create(createEventDto: CreateEventDto) {
  //   return "This action adds a new event";
  // }

  // findAll() {
  //   return `This action returns all events`;
  // }

  // findOne(id: number) {
  //   return `This action returns a #${id} event`;
  // }

  async update(id: number, updateEventDto: UpdateEventDto) {
    try {
      return this.prismaService.events.update({
        where: { event_id: id },
        data: { ...updateEventDto },
      });
    } catch (error) {
      throw error;
    }
  }

  // remove(id: number) {
  //   return `This action removes a #${id} event`;
  // }
}
