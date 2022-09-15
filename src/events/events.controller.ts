import { OrganizationRole, InvitationStatus, User } from ".prisma/client";
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotImplementedException,
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
import { EventRolesGuard } from "../auth/guards/eventRoles.guard";
import { UpdateInvitationDto } from "../invitations/dto/update-invitation.dto";
import { EventInvitationsService } from "../invitations/services/eventInvitations.service";
import { OrganizationsService } from "../organizations/organizations.service";
import { ArrangerRegistrationService } from "../registrations/services";
import { isUUID } from "../util/uuid";
import {
  CreateEventDto,
  SearchEventDto,
  SearchEventRegistrationDto,
  UpdateEventDto,
  SearchEventRegistrationCountDto,
} from "./dto";
import { EventsService } from "./events.service";
import { EventNotFoundException } from "./exceptions";

@Controller("events")
export class EventsController {
  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly eventsService: EventsService,
    private readonly arrangerRegistrationService: ArrangerRegistrationService,
    private readonly eventInvitationsService: EventInvitationsService,
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
        // file size limit 50 MB
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
      /* check if arrangerId is org */
      const org = await this.organizationsService.findByArrangerId(arrangerId);
      if (org) {
        /* check if user is admin of org */
        const admin = org.organizationRoles.find(
          (o) =>
            o.userId === req.user.id &&
            (o.role === OrganizationRole.ADMIN ||
              o.role === OrganizationRole.OWNER),
        );
        if (!admin) {
          throw new UnauthorizedException(
            "User is not an admin of the organization",
          );
        }
      } else {
        if (req.user.arrangerId !== arrangerId) {
          throw new UnauthorizedException(
            "arrangerId in dto does not match user arrangerId",
          );
        }
      }
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

  @Get(":id")
  async findOne(@Param("id") id: string) {
    /* both urlId and id are valid here */
    if (isUUID(id)) {
      return this.eventsService.findOne(id);
    }
    return this.eventsService.findOneByUrlId(id);
  }

  @OrganizationRoles(OrganizationRole.ADMIN, OrganizationRole.OWNER)
  @UseGuards(AuthenticatedGuard, EventRolesGuard)
  @Patch(":id")
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
  async update(
    @Param("id") id: string,
    @Body() updateEventDto: UpdateEventDto,
    @UploadedFile() eventImage?: Express.Multer.File,
  ) {
    //the user has to be the arranger or the admin of the organization
    return this.eventsService.update(updateEventDto, id, eventImage);
  }

  @OrganizationRoles(OrganizationRole.ADMIN, OrganizationRole.OWNER)
  @UseGuards(AuthenticatedGuard, EventRolesGuard)
  @Delete(":id")
  async remove(@Req() @Param("id") id: string) {
    //the user has to be the arranger or the admin of the organization
    return this.eventsService.remove(id);
  }

  @OrganizationRoles(OrganizationRole.ADMIN, OrganizationRole.OWNER)
  @UseGuards(AuthenticatedGuard, EventRolesGuard)
  @Get(":id/registrations")
  async getRegistrations(
    @Query() query: SearchEventRegistrationDto,
    @Param("id") id: string,
  ) {
    return this.arrangerRegistrationService.findAll(
      query,
      id,
      query.skip,
      query.take,
    );
  }

  @Get(":id/registration-count")
  async getRegistrationCount(
    @Query() query: SearchEventRegistrationCountDto,
    @Param("id") id: string,
  ) {
    return this.arrangerRegistrationService.getRegistrationCount(query, id);
  }

  @UseGuards(AuthenticatedGuard)
  @Post(":id/invitations")
  async sendInvitations(
    @Req() req: any,
    @Param("id") id: string,
    @Body() userIds: string[],
  ) {
    const user: User = req.user;
    return this.eventInvitationsService.createInvitations(id, user.id, userIds);
  }

  @OrganizationRoles(OrganizationRole.ADMIN, OrganizationRole.OWNER)
  @UseGuards(AuthenticatedGuard, EventRolesGuard)
  @Get(":id/invitations")
  async getInvitations(@Param("id") id: string) {
    return this.eventInvitationsService.findAllInvitationsForEventIncludingUsers(
      id,
    );
  }

  @UseGuards(AuthenticatedGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Patch(":id/invitations")
  async updateInvitation(
    @Req() req: any,
    @Param("id") id: string,
    @Body() updateInvitationDto: UpdateInvitationDto,
  ) {
    /* The toUser can update to ACCEPTED, DECLINED, and IGNORED only if the status is PENDING
     * while the fromUser can update to CANCELLED only if the status is still PENDING
     */
    const user: User = req.user;

    try {
      switch (updateInvitationDto.status) {
        case InvitationStatus.ACCEPTED:
          return this.eventInvitationsService.acceptInvitationsToEvent(
            id,
            user.id,
          );
        case InvitationStatus.DECLINED:
          return this.eventInvitationsService.declineInvitationsToEvent(
            id,
            user.id,
          );
        case InvitationStatus.IGNORED:
          return this.eventInvitationsService.ignoreInvitationsToEvent(
            id,
            user.id,
          );
        case InvitationStatus.CANCELLED:
          throw new NotImplementedException(
            "Not yet implemented cancelling invitations",
          );
        default:
          throw new BadRequestException(
            "You can only update to ACCEPTED, DECLINED, IGNORED, or CANCELLED",
          );
      }
    } catch (err) {
      const event = await this.eventsService.findOne(id);
      if (!event) {
        throw new EventNotFoundException(id);
      }
      throw err;
    }
  }
}
