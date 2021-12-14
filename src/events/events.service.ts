import { Injectable } from "@nestjs/common";
import { validate } from "class-validator";
import { PrismaService } from "src/prisma.service";
import { CreateEventDto } from "./dto/create-event.dto";
// import { UpdateEventDto } from "./dto/update-event.dto";

@Injectable()
export class EventsService {
  constructor(private readonly prismaService: PrismaService) {}

  create(createEventDto: CreateEventDto) {
    const update = this.prismaService.events.create({
      data: createEventDto,
    });

    console.log("creating update");

    validate(update).then((errors) => {
      if (errors.length > 0) {
        console.log("creation failed: ", errors);
      } else {
        console.log("creation succeeded");
        return update;
      }
    });
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

  // update(id: number, updateEventDto: UpdateEventDto) {
  //   return `This action updates a #${id} event`;
  // }

  // remove(id: number) {
  //   return `This action removes a #${id} event`;
  // }
}
