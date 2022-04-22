import { EventArrangerRole, OrganizationRole, User } from ".prisma/client";
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
import { OrganizationRoles } from "../../decorators/organizationRoles.decorator";
import { AuthenticatedGuard } from "../auth/guards";
import { OrganizationRolesGuard } from "../auth/guards/organizationRoles.guard";
import { OrganizationsService } from "../organizations/organizations.service";
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
    private readonly organizationsService: OrganizationsService,
    private readonly eventsService: EventsService,
    private readonly arrangerRegistrationServcice: ArrangerRegistrationService,
  ) {}

  @UseGuards(AuthenticatedGuard)
  @Post()
  // admin only for now, but other roles may be specified later
  @OrganizationRoles(OrganizationRole.ADMIN)
  @UseGuards(OrganizationRolesGuard)
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
    /* creates an event.
    Args:
      req: the request object
      createEventDto: the event data (if arrangerId is not provided, we use users arrangerId)
      eventImage: the event image
    Returns:
      new event

    */
    let arrangerId;
    if (createEventDto.arrangerId) {
      arrangerId = createEventDto.arrangerId;
    } else {
      arrangerId = req.user.arrangerId;
    }
    return this.eventsService.create(createEventDto, arrangerId, eventImage);
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

  @Get(":urlId")
  async findOne(@Param("urlId") urlId: string) {
    return this.eventsService.findOne(urlId);
  }

  @UseGuards(AuthenticatedGuard)
  @Patch(":urlId")
  async update(
    @Req() req: any,
    @Param("urlId") urlId: string,
    @Body() updateEventDto: UpdateEventDto,
  ) {
    const user: User = req.user;
    const event = await this.eventsService.findOneWithArrangers(urlId);

    if (event.eventArrangers.find((e) => e.arrangerId === user.arrangerId)) {
      return this.eventsService.update(urlId, updateEventDto);
    } else {
      throw new UnauthorizedException(
        "You are not authorized to update this event",
      );
    }
  }

  @UseGuards(AuthenticatedGuard)
  @Delete(":urlId")
  async remove(@Req() req: any, @Param("urlId") urlId: string) {
    const user: User = req.user;
    const event = await this.eventsService.findOneWithArrangers(urlId);
    if (
      event.eventArrangers.find(
        (e) =>
          e.arrangerId === user.arrangerId &&
          e.role === EventArrangerRole.ADMIN,
      )
    ) {
      return this.eventsService.remove(urlId);
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
