import {
  EventArrangerRole,
  OrganizationRole,
  InvitationStatus,
  User,
} from ".prisma/client";
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
import { UpdateInvitationDto } from "../invitations/dto/update-invitation.dto";
import { EventInvitationDoesNotExistException } from "../invitations/exceptions/eventInvitationDoesNotExistException.exception";
import { EventInvitationsService } from "../invitations/services/eventInvitations.service";
import { OrganizationsService } from "../organizations/organizations.service";
import { ArrangerRegistrationService } from "../registrations/services";
import {
  CreateEventDto,
  SearchEventDto,
  SearchEventRegistrationDto,
  UpdateEventDto,
} from "./dto";
import { EventsService } from "./events.service";
import { EventNotFoundException } from "./exceptions";

@Controller("events")
export class EventsController {
  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly eventsService: EventsService,
    private readonly arrangerRegistrationServcice: ArrangerRegistrationService,
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
      /* check if arrangerid is org */
      const org = await this.organizationsService.findByArrangerId(arrangerId);
      if (org) {
        /* check if user is admin of org */
        const admin = org.organizationRoles.find(
          (o) => o.userId === req.user.id && o.role === OrganizationRole.ADMIN,
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

  @Get(":urlId")
  async findOne(@Param("urlId") urlId: string) {
    return this.eventsService.findOneByUrlId(urlId);
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

  @UseGuards(AuthenticatedGuard)
  @Patch(":id/invitations/:invitationId")
  async updateInvitation(
    @Req() req: any,
    @Param("id") id: string,
    @Param("invitationId") invitationId: string,
    @Body() updateInvitationDto: UpdateInvitationDto,
  ) {
    /* The toUser can update to ACCEPTED, DECLINED, and IGNORED only if the status is PENDING
     * while the fromUser can update to CANCELLED only if the status is still PENDING
     */
    const user: User = req.user;
    const event = await this.eventsService.findOne(id);
    if (!event) {
      throw new EventNotFoundException(id);
    }

    const invitation = await this.eventInvitationsService.findOne(invitationId);
    if (!invitation) {
      throw new EventInvitationDoesNotExistException(
        "Invitation does not exist",
      );
    }

    if (invitation.invitationStatus !== InvitationStatus.PENDING) {
      throw new BadRequestException(
        "You can only update to ACCEPTED, DECLINED, or IGNORED if the status is PENDING",
      );
    }

    switch (updateInvitationDto.status) {
      case InvitationStatus.ACCEPTED:
        if (user.id === invitation.toUserId) {
          return this.eventInvitationsService.acceptInvitation(invitationId);
        }
        throw new UnauthorizedException(
          "You can only update to ACCEPTED if you are the toUser",
        );
      case InvitationStatus.DECLINED:
        if (user.id === invitation.toUserId) {
          return this.eventInvitationsService.declineInvitation(invitationId);
        }
        throw new UnauthorizedException(
          "You can only update to DECLINED if you are the toUser",
        );
      case InvitationStatus.IGNORED:
        if (user.id === invitation.toUserId) {
          return this.eventInvitationsService.ignoreInvitation(invitationId);
        }
        throw new UnauthorizedException(
          "You can only update to IGNORED if you are the toUser",
        );
      case InvitationStatus.CANCELLED:
        if (user.id === invitation.fromUserId) {
          return this.eventInvitationsService.cancelInvitation(invitationId);
        }
        throw new UnauthorizedException(
          "You can only update to CANCELLED if you are the fromUser",
        );
      default:
        throw new BadRequestException(
          "You can only update to ACCEPTED, DECLINED, IGNORED, or CANCELLED",
        );
    }
  }
}
