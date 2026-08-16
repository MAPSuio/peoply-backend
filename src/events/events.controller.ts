import {
  EventArrangerRole,
  OrganizationRole,
  InvitationStatus,
  User,
} from "../generated/prisma/client";
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  NotImplementedException,
  Param,
  ParseArrayPipe,
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
import { IMAGE_UPLOAD_OPTIONS } from "../azure/image-upload";
import { OrganizationRoles } from "../../decorators/organizationRoles.decorator";
import { EventArrangerRoles } from "../../decorators/eventArrangerRoles.decorator";
import { AuthenticatedGuard } from "../auth/guards";
import { EventRolesGuard } from "../auth/guards/eventRoles.guard";
import { IsArrangerInterceptor } from "../auth/interceptors/isArranger.interceptor";
import { UpdateInvitationDto } from "../invitations/dto/update-invitation.dto";
import { EventCoOrganizerInvitationsService } from "../invitations/services/eventCoOrganizerInvitations.service";
import { EventInvitationsService } from "../invitations/services/eventInvitations.service";
import { MAX_INVITATIONS_PER_REQUEST } from "../invitations/invitations.constants";
import { OrganizationsService } from "../organizations/organizations.service";
import { ArrangerUpdateRegistrationDto } from "../registrations/dto";
import { ArrangerRegistrationService } from "../registrations/services";
import { isUUID } from "../util/uuid";
import {
  CreateEventDto,
  SearchEventDto,
  SearchEventRegistrationDto,
  UpdateEventDto,
  SearchEventRegistrationCountDto,
} from "./dto";
import { SendUpdateDto } from "./dto/send-update.dto";
import { EventsService } from "./events.service";
import { EventNotFoundException } from "./exceptions";

@Controller("events")
export class EventsController {
  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly eventsService: EventsService,
    private readonly arrangerRegistrationService: ArrangerRegistrationService,
    private readonly eventInvitationsService: EventInvitationsService,
    private readonly coOrganizerInvitationsService: EventCoOrganizerInvitationsService,
  ) {}

  @UseGuards(AuthenticatedGuard)
  @Post()
  @UseInterceptors(FileInterceptor("eventImage", IMAGE_UPLOAD_OPTIONS))
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
    // `||`, not `??`: the check below branches on truthiness, so an empty
    // arrangerId has to fall back to the user's the same way it did before.
    const arrangerId: string = createEventDto.arrangerId || req.user.arrangerId;

    if (createEventDto.arrangerId) {
      /* check if arrangerId is org */
      const org = await this.organizationsService.findByArrangerId(arrangerId);
      if (org) {
        /* check if user is admin of org */
        const isAdmin = org.organizationRoles.find(
          (o) =>
            o.userId === req.user.id &&
            (o.role === OrganizationRole.ADMIN ||
              o.role === OrganizationRole.OWNER),
        );
        if (!isAdmin) {
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
    }

    return this.eventsService.create(
      createEventDto,
      arrangerId,
      req.user.id,
      eventImage,
    );
  }

  // TODO: Should add a guard that gets the user, but is undefined if not logged in
  // for private events
  @Get()
  async findAll(@Query() query: SearchEventDto) {
    return this.eventsService.findAll(query);
  }

  @Get(":id")
  @OrganizationRoles(OrganizationRole.ADMIN, OrganizationRole.OWNER)
  @UseInterceptors(IsArrangerInterceptor)
  async findOne(@Req() req: any, @Param("id") id: string) {
    /* both urlId and id are valid here */
    return this.eventsService.findOneVisibleToUser(
      id,
      req.user?.id,
      req.isArranger,
    );
  }

  @OrganizationRoles(OrganizationRole.ADMIN, OrganizationRole.OWNER)
  @UseGuards(AuthenticatedGuard, EventRolesGuard)
  @Patch(":id")
  @UseInterceptors(FileInterceptor("eventImage", IMAGE_UPLOAD_OPTIONS))
  async update(
    @Req() req: any,
    @Param("id") id: string,
    @Body() updateEventDto: UpdateEventDto,
    @UploadedFile() eventImage?: Express.Multer.File,
  ) {
    /* `syncCoOrganizers` deleteMany's the co-organizers this does not list, so
       passing an empty array is how a co-organizer would remove every other
       one - including the arranger that invited them. Editing the event itself
       is fine; editing who owns it is not. */
    if (
      updateEventDto.coOrganizerOrganizationIds !== undefined &&
      req.eventArrangerRole === EventArrangerRole.COLLABORATOR
    ) {
      throw new ForbiddenException(
        "Co-organizers cannot change the list of co-organizers",
      );
    }

    //the user has to be the arranger or the admin of the organization
    return this.eventsService.update(
      updateEventDto,
      id,
      req.user.id,
      eventImage,
    );
  }

  @OrganizationRoles(OrganizationRole.ADMIN, OrganizationRole.OWNER)
  /* Deleting cascades to every registration on the event. A co-organizer was
     invited to help run it, not to be able to destroy someone else's. */
  @EventArrangerRoles(EventArrangerRole.ADMIN)
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
    return this.arrangerRegistrationService.findAll(query, id);
  }

  @OrganizationRoles(OrganizationRole.ADMIN, OrganizationRole.OWNER)
  @UseInterceptors(IsArrangerInterceptor)
  @Get(":id/registration-count")
  async getRegistrationCount(
    @Req() req: any,
    @Query() query: SearchEventRegistrationCountDto,
    @Param("id") id: string,
  ) {
    return this.arrangerRegistrationService.getRegistrationCount(
      query,
      id,
      req.isArranger,
    );
  }

  @OrganizationRoles(OrganizationRole.ADMIN, OrganizationRole.OWNER)
  @UseGuards(AuthenticatedGuard, EventRolesGuard)
  @Post(":id/invitations")
  async sendInvitations(
    @Req() req: any,
    @Param("id") id: string,
    // A bare string[] body carries no validation metadata, so the global
    // ValidationPipe skipped it entirely: a non-array body reached
    // createInvitations and became a 500 on .map(), and an arbitrarily long
    // array became an unbounded createMany inside one transaction.
    @Body(
      new ParseArrayPipe({
        items: String,
        separator: undefined,
      }),
    )
    userIds: string[],
  ) {
    const user: User = req.user;

    if (userIds.length > MAX_INVITATIONS_PER_REQUEST) {
      throw new BadRequestException(
        `Cannot send more than ${MAX_INVITATIONS_PER_REQUEST} invitations in one request`,
      );
    }

    if (!userIds.every((userId) => isUUID(userId))) {
      throw new BadRequestException("userIds must all be UUIDs");
    }

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
            updateInvitationDto.formAnswer,
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

  @OrganizationRoles(OrganizationRole.ADMIN, OrganizationRole.OWNER)
  @UseGuards(AuthenticatedGuard, EventRolesGuard)
  @Patch(":id/registrations/:userId")
  async updateUserRegistration(
    @Req() req: any,
    @Param("userId") userId: string,
    @Param("id") eventId: string,
    @Body() updateDTO: ArrangerUpdateRegistrationDto,
  ) {
    return this.arrangerRegistrationService.update(userId, eventId, updateDTO);
  }

  @OrganizationRoles(OrganizationRole.ADMIN, OrganizationRole.OWNER)
  @UseGuards(AuthenticatedGuard, EventRolesGuard)
  @Delete(":id/registrations/:userId")
  async deleteUserRegistration(
    @Req() req: any,
    @Param("id") eventId: string,
    @Param("userId") userId: string,
  ) {
    return this.arrangerRegistrationService.remove(eventId, userId);
  }

  @OrganizationRoles(OrganizationRole.ADMIN, OrganizationRole.OWNER)
  @UseGuards(AuthenticatedGuard, EventRolesGuard)
  @Post(":id/update")
  async sendUpdate(
    @Req() req: any,
    @Param("id") id: string,
    @Body() sendUpdateDto: SendUpdateDto,
  ) {
    const user: User = req.user;
    return this.eventsService.sendUpdateToEventParticipants(
      user.id,
      id,
      sendUpdateDto,
    );
  }

  @OrganizationRoles(OrganizationRole.ADMIN, OrganizationRole.OWNER)
  @UseInterceptors(IsArrangerInterceptor)
  @Get(":id/updates")
  async getUpdates(@Req() req: any, @Param("id") id: string) {
    return this.eventsService.getUpdatesForEvent(
      id,
      req.user?.id,
      req.isArranger,
    );
  }

  @OrganizationRoles(OrganizationRole.ADMIN, OrganizationRole.OWNER)
  @UseGuards(AuthenticatedGuard, EventRolesGuard)
  @Delete(":id/update/:updateId")
  async deleteUpdate(
    @Req() req: any,
    @Param("id") id: string,
    @Param("updateId") updateId: string,
  ) {
    return this.eventsService.deleteUpdateForEvent(id, updateId);
  }

  /** Every co-organizer invitation on this event, for the event's own admins. */
  @OrganizationRoles(OrganizationRole.ADMIN, OrganizationRole.OWNER)
  @EventArrangerRoles(EventArrangerRole.ADMIN)
  @UseGuards(AuthenticatedGuard, EventRolesGuard)
  @Get(":id/coorganizer-invitations")
  async getCoOrganizerInvitations(@Param("id") id: string) {
    return this.coOrganizerInvitationsService.findAllForEvent(id);
  }

  /**
   * Answers a co-organizer invitation.
   *
   * Two different parties can act here, so the guard is only
   * AuthenticatedGuard and the authority check lives below:
   *   - an ADMIN/OWNER of the invited organization accepts, declines or
   *     ignores a pending invitation;
   *   - an admin of the event cancels one it sent.
   */
  @UseGuards(AuthenticatedGuard)
  @Patch(":id/coorganizer-invitations/:invitationId")
  async respondToCoOrganizerInvitation(
    @Req() req: any,
    @Param("id") id: string,
    @Param("invitationId") invitationId: string,
    @Body() updateInvitationDto: UpdateInvitationDto,
  ) {
    const user: User = req.user;
    const invitation =
      await this.coOrganizerInvitationsService.findOne(invitationId);

    // Checked before authority so that guessing an invitation id cannot be
    // used to probe which events a given id belongs to.
    if (!invitation || invitation.eventId !== id) {
      throw new NotFoundException(
        `Co-organizer invitation ${invitationId} does not exist on event ${id}`,
      );
    }

    const { status } = updateInvitationDto;

    if (status === InvitationStatus.CANCELLED) {
      const isEventAdmin = await this.eventsService.isEventAdmin(id, user.id);
      if (!isEventAdmin) {
        throw new UnauthorizedException(
          "Only an admin of the event can cancel the invitation",
        );
      }

      if (invitation.invitationStatus === InvitationStatus.CANCELLED) {
        throw new BadRequestException("Invitation is already cancelled");
      }

      return this.coOrganizerInvitationsService.respond(
        invitationId,
        status,
        user.id,
      );
    }

    if (!this.coOrganizerInvitationsService.isOrganizationResponse(status)) {
      throw new BadRequestException(
        "You can only update to ACCEPTED, DECLINED, IGNORED, or CANCELLED",
      );
    }

    const canRespond =
      await this.coOrganizerInvitationsService.canRespondOnBehalfOf(
        user.id,
        invitation.organizationId,
      );

    if (!canRespond) {
      throw new UnauthorizedException(
        "User is not an admin of the invited organization",
      );
    }

    if (invitation.invitationStatus !== InvitationStatus.PENDING) {
      throw new BadRequestException(
        "Invitation status is not PENDING, cannot update",
      );
    }

    return this.coOrganizerInvitationsService.respond(
      invitationId,
      status,
      user.id,
    );
  }
}
