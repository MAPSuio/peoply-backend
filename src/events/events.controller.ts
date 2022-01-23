import { event_arranger_roles, users } from ".prisma/client";
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { AuthenticatedGuard } from "../auth/guards";
import { PrismaOrderDirections } from "../prisma/prisma.constants";
import { ArrangerRegistrationService } from "../registrations/services";
import {
  CreateEventDto,
  SearchEventDto,
  SearchEventRegistrationDto,
  UpdateEventDto,
} from "./dto";
import { EventsService } from "./events.service";

@Controller("events")
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly arrangerRegistrationServcice: ArrangerRegistrationService,
  ) {}

  @UseGuards(AuthenticatedGuard)
  @Post()
  async create(@Req() req: any, @Body() createEventDto: CreateEventDto) {
    const user: users = req.user;
    return this.eventsService.create(createEventDto, user.arranger_id);
  }

  // TODO: Should add a guard that gets the user, but is undefined if not logged in
  // for private events
  @Get()
  async findAll(@Query() query: SearchEventDto) {
    console.log(PrismaOrderDirections.ASC);
    return this.eventsService.findAll(
      query,
      query.skip,
      query.take,
      query.orderBy,
      query.orderDirection,
    );
  }

  // TODO: Should add a guard that gets the user, but is undefined if not logged in
  // for private events
  @Get(":id")
  async findOne(@Param("id") id: number) {
    return this.eventsService.findOne(id);
  }

  @UseGuards(AuthenticatedGuard)
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

  @UseGuards(AuthenticatedGuard)
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

  @Get(":id/registrations")
  async getRegistrations(
    @Query() query: SearchEventRegistrationDto,
    @Param("id") id: string,
  ) {
    return this.arrangerRegistrationServcice.findAll(query, id);
  }
}
