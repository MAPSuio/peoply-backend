import { event_arranger_roles, users } from ".prisma/client";
import {
  BadRequestException,
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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AuthenticatedGuard } from "../auth/guards";
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
  @UseInterceptors(
    FileInterceptor("eventImage", {
      fileFilter: (req, file, callback) => {
        if (file.mimetype !== "image/jpeg" && file.mimetype !== "image/png") {
          callback(
            new BadRequestException("Only .jpeg and .png files are allowed!"),
            false,
          );
        } else {
          callback(null, true);
        }
      },
      limits: {
        // filesize limit 50 MB
        fileSize: 50 * 1024 * 1024,
      },
    }),
  )
  async create(
    @Req() req: any,
    @Body() createEventDto: CreateEventDto,
    @UploadedFile() eventImage?: Express.Multer.File,
  ) {
    const user: users = req.user;
    return this.eventsService.create(
      createEventDto,
      user.arranger_id,
      eventImage,
    );
  }

  // TODO: Should add a guard that gets the user, but is undefined if not logged in
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

  @Get(":id/registrations/number-going")
  async findNumberGoing(@Param("id") id: string) {
    return this.arrangerRegistrationServcice.findNumberAttending(id, "GOING");
  }
}
