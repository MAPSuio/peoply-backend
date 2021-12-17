import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from "@nestjs/common";
import { EventsService } from "./events.service";
import { CreateEventDto } from "./dto/create-event.dto";
import { UpdateEventDto } from "./dto/update-event.dto";
import { UserRegistrationService } from "src/registrations/services/user.registrations.service";

@Controller("events")
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly userRegistrationService: UserRegistrationService,
  ) {}

  @Post()
  async create(@Body() createEventDto: CreateEventDto) {
    return this.eventsService.create(createEventDto);
  }

  @Get()
  async findAll() {
    return this.eventsService.findAll();
  }

  @Get(":id")
  async findOne(@Param("id") id: number) {
    return this.eventsService.findOne(id);
  }

  @Get("/users/:user_id")
  async findAllEventsRegistered(@Param("user_id") user_id: string) {
    return this.userRegistrationService.findAll(user_id);
  }

  @Patch(":id")
  async update(
    @Param("id") id: number,
    @Body() updateEventDto: UpdateEventDto,
  ) {
    return this.eventsService.update(id, updateEventDto);
  }

  @Delete(":id")
  remove(@Param("id") id: number) {
    return this.eventsService.remove(id);
  }
}
