import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Req,
  UnauthorizedException,
  BadRequestException,
} from "@nestjs/common";
import { EventsService } from "./events.service";
import { CreateEventDto } from "./dto/create-event.dto";
import { UpdateEventDto } from "./dto/update-event.dto";
import { SearchEventDto } from "./dto/search-event-dto";
import { AccessGuard } from "src/auth/guards/access.guard";
import { event_arranger_roles, users } from "@prisma/client";

@Controller("events")
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @UseGuards(AccessGuard)
  @Post()
  async create(@Req() req: any, @Body() createEventDto: CreateEventDto) {
    const user: users = req.user;

    if (!user.arranger_id) {
      throw new BadRequestException(
        "Something went wrong. You dont seem to have an arranger_id.",
      );
    }
    return this.eventsService.create(createEventDto, user.arranger_id);
  }

  // Should add a guard that gets the user, but is undefined if not logged in
  // for private events
  @Get()
  async findAll(@Query() query: SearchEventDto) {
    return this.eventsService.findAll(
      query,
      query.skip,
      query.take,
      query.orderBy,
      query.orderDirection,
    );
  }

  // Should add a guard that gets the user, but is undefined if not logged in
  // for private events
  @Get(":id")
  async findOne(@Param("id") id: number) {
    return this.eventsService.findOne(id);
  }

  @UseGuards(AccessGuard)
  @Patch(":id")
  async update(
    @Req() req: any,
    @Param("id") id: number,
    @Body() updateEventDto: UpdateEventDto,
  ) {
    const user: users = req.user;
    const event = await this.eventsService.findOneWithEventArrangers(id);
    if (event.event_arrangers.find((e) => e.arranger_id === user.arranger_id)) {
      return this.eventsService.update(id, updateEventDto);
    } else {
      throw new UnauthorizedException(
        "You are not authorized to update this event",
      );
    }
  }

  @UseGuards(AccessGuard)
  @Delete(":id")
  async remove(@Req() req: any, @Param("id") id: number) {
    const user: users = req.user;
    const event = await this.eventsService.findOneWithEventArrangers(id);
    if (
      event.event_arrangers.find(
        (e) =>
          e.arranger_id === user.arranger_id &&
          e.role === event_arranger_roles.ADMIN,
      )
    ) {
      return this.eventsService.remove(id);
    } else {
      throw new UnauthorizedException(
        "You are not authorized to delete this event",
      );
    }
  }
}
