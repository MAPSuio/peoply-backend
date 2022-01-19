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
import { UserRegistrationService } from "src/registrations/services/user.registrations.service";
import { SearchEventDto } from "./dto/search-event-dto";
import { AccessGuard } from "src/auth/guards/access.guard";
import { event_arranger_roles, reg_status, users } from "@prisma/client";
import { get } from "http";
import { query } from "express";
import { PrismaService } from "src/prisma.service";
import { number } from "joi";
import { CreateRegistrationDto } from "src/registrations/dto/create-registration.dto";
import { ArrangerRegistrationService } from "src/registrations/services/arranger.registrations.service";
import { SearchRegistrationDto } from "./dto/search-registration-dto";
import { skip } from "rxjs";

@Controller("events")
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly userRegistrationService: UserRegistrationService,
    private readonly arrangerRegistrationServcice: ArrangerRegistrationService,
  ) {}

  @UseGuards(AccessGuard)
  @Post()
  async create(@Req() req: any, @Body() createEventDto: CreateEventDto) {
    const user: users = req.user;
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

  // TODO: Should add a guard that gets the user, but is undefined if not logged in
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

  @Get(":id/registrations")
  async GetRegistrations(
    @Query() query: SearchRegistrationDto,
    @Param("id") id: string,
  ) {
    return this.arrangerRegistrationServcice.findAll(query, id);
  }

  // @UseGuards(AccessGuard)
  // @Post("/:id/register")
  // async createRegistration(
  //   @Req() req: any,
  //   @Param("id") id: number,
  //   @Body() registrationDto: CreateRegistrationDto,
  // ) {
  //   if (req.user.user_id === registrationDto.user_id) {
  //     return this.userRegistrationService.create(registrationDto);
  //   } else {
  //     throw new UnauthorizedException(
  //       "You are not authorized to register this user",
  //     );
  //   }
  // }

  /*
  @UseGuards(AccessGuard)
  @Get("/me")
  async findMyRegistrations(@Req() req: any) {
    return this.userRegistrationService.findAllRegisteredEvents(
      req.user.user_id,
    );
  }

  @UseGuards(AccessGuard)
  @Get("/me/:status")
  async findMyEventsWithStatus(
    @Req() req: any,
    @Param("status") status: reg_status,
  ) {
    // TODO: throw a 404 if the status is not a known regstatus
    return this.userRegistrationService.findAllWithStatus(
      req.user.user_id,
      status,
    );
  }
  */
}
