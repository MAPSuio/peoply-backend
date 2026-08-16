import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseArrayPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { IMAGE_UPLOAD_OPTIONS } from "../azure/image-upload";
import {
  InvitationStatus,
  OrganizationRole,
  User,
} from "../generated/prisma/client";
import { OrganizationRoles } from "../../decorators/organizationRoles.decorator";
import { EventArrangersService } from "../arrangers/services";
import {
  AuthenticatedGuard,
  OrganizationRolesGuard,
  UserIdVerificationGuard,
} from "../auth/guards";
import { CreateOrganizationInvitationDto } from "../invitations/dto/create-organizationInvitation.dto";
import { UpdateInvitationDto } from "../invitations/dto/update-invitation.dto";
import { OrganizationInvitationDoesNotExistException } from "../invitations/exceptions/organizationInvitationDoesNotExistException.exception";
import { OrganizationInvitationsService } from "../invitations/services/organizationInvitations.service";
import { isUUID } from "../util/uuid";
import {
  ChangeOwnerDto,
  ChangeRoleDescriptionDTO,
  ChangeRoleDto,
  UpdateOrganizationApprovalDto,
  UpdateOrganizationDto,
} from "./dto";
import { CreateOrganizationDto } from "./dto/create-organization.dto";
import { SearchOrganizationDto } from "./dto/search-organization.dto";
import { OrganizationDoesNotExistException } from "./exceptions";
import { OrganizationsService } from "./organizations.service";
import {
  createOrganizationCalendarIcs,
  getOrganizationCalendarFileName,
} from "./organization-calendar";
import { AdministrationService } from "../administration/administration.service";

@Controller("organizations")
export class OrganizationsController {
  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly organizationInvitationsService: OrganizationInvitationsService,
    private readonly eventArrangersService: EventArrangersService,
    private readonly administrationService: AdministrationService,
  ) {}

  @UseGuards(AuthenticatedGuard)
  @Post()
  async create(
    @Req() req: any,
    @Body() createOrganizationDto: CreateOrganizationDto,
  ) {
    /* create new organization

    Args:
        createOrganizationDto: CreateOrganizationDto - data to create the organization with

    Returns:
        Organization - the created organization
    */
    return this.organizationsService.create(req.user.id, createOrganizationDto);
  }

  /* endpoint to GET all orgs */
  @Get()
  async findAll(@Query() query: SearchOrganizationDto) {
    return this.organizationsService.findAll(query);
  }

  @UseGuards(AuthenticatedGuard)
  @Get("/admin/all")
  async findAllAdmin(@Req() req: any, @Query() query: SearchOrganizationDto) {
    await this.administrationService.ensureAccess(req.user.id);
    return this.organizationsService.findAllIncludingUnapproved(query);
  }

  @UseGuards(AuthenticatedGuard)
  @Patch("/admin/:orgId/approval")
  async updateApproval(
    @Req() req: any,
    @Param("orgId") orgId: string,
    @Body() updateOrganizationApprovalDto: UpdateOrganizationApprovalDto,
  ) {
    await this.administrationService.ensureAdmin(req.user.id);
    return this.organizationsService.updateApproval(
      orgId,
      updateOrganizationApprovalDto.approved,
    );
  }

  @Get("/:orgId")
  async getOrganization(@Param("orgId") orgId: string) {
    const org = isUUID(orgId)
      ? await this.organizationsService.findOne(orgId)
      : await this.organizationsService.findOneByUrlId(orgId);

    // findOne returns null rather than raising, so this is the real
    // not-found path. The catch that used to wrap it tested for P2001,
    // which Prisma never raises here.
    if (!org) {
      throw new OrganizationDoesNotExistException(orgId);
    }
    return org;
  }

  @OrganizationRoles(OrganizationRole.ADMIN, OrganizationRole.OWNER)
  @UseGuards(AuthenticatedGuard, OrganizationRolesGuard)
  @UseInterceptors(FileInterceptor("orgImage", IMAGE_UPLOAD_OPTIONS))
  @Patch("/:orgId")
  async update(
    @Req() req: any,
    @Param("orgId") orgId: string,
    @Body() updateOrganizationDto: UpdateOrganizationDto,
    @UploadedFile() orgImage?: Express.Multer.File,
  ) {
    /* update organization
    Args:
        updateOrganizationDto: UpdateOrganizationDto - data to update the organization with
    Returns:
        Organization - the updated organization
    */
    const org = await this.organizationsService.findOne(orgId);
    if (!org) {
      throw new OrganizationDoesNotExistException(orgId);
    }
    return this.organizationsService.update(
      org,
      updateOrganizationDto,
      orgImage,
    );
  }

  @OrganizationRoles(OrganizationRole.OWNER)
  @UseGuards(AuthenticatedGuard, OrganizationRolesGuard)
  @Delete("/:orgId")
  async delete(@Req() req: any, @Param("orgId") orgId: string) {
    /* delete organization
    Args:
        orgId: string - id of the organization to delete
    Returns:
        Organization - the deleted organization
    */
    return this.organizationsService.remove(orgId);
  }

  @Get(":orgId/events")
  async getEvents(@Req() req: any, @Param("orgId") orgId: string) {
    /* get events for organization
    Args:
        orgId: string - id of the organization to get events for
    Returns:
        List<Event> - list of events for the organization
    */
    const arrangerID = await this.organizationsService.getArrangerId(orgId);
    if (!arrangerID) {
      return;
    }
    return await this.eventArrangersService.findAllPublicWithEvents(arrangerID);
  }

  @UseGuards(AuthenticatedGuard)
  @Get(":orgId/report-status")
  async getReportOrganizationStatus(
    @Req() req: any,
    @Param("orgId") orgId: string,
  ) {
    const organization = isUUID(orgId)
      ? await this.organizationsService.findOne(orgId)
      : await this.organizationsService.findOneByUrlId(orgId);

    if (!organization) {
      throw new OrganizationDoesNotExistException(orgId);
    }

    return this.organizationsService.getOrganizationReportStatus(
      req.user.id,
      organization.id,
    );
  }

  @UseGuards(AuthenticatedGuard)
  @Post(":orgId/report")
  async reportOrganization(@Req() req: any, @Param("orgId") orgId: string) {
    const organization = isUUID(orgId)
      ? await this.organizationsService.findOne(orgId)
      : await this.organizationsService.findOneByUrlId(orgId);

    if (!organization) {
      throw new OrganizationDoesNotExistException(orgId);
    }

    return this.organizationsService.reportOrganization(
      req.user.id,
      organization,
    );
  }

  @Get(":orgId/calendar.ics")
  async getOrganizationCalendar(
    @Param("orgId") orgId: string,
    @Res() res: any,
  ) {
    const organization = isUUID(orgId)
      ? await this.organizationsService.findOne(orgId)
      : await this.organizationsService.findOneByUrlId(orgId);

    if (!organization) {
      throw new OrganizationDoesNotExistException(orgId);
    }

    const arrangerId = organization.arrangerId;
    if (!arrangerId) {
      const emptyCalendar = createOrganizationCalendarIcs(
        organization,
        [],
        process.env.FRONTEND_URL,
      );

      res.setHeader("Content-Type", "text/calendar; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${getOrganizationCalendarFileName(organization)}"`,
      );
      return res.status(200).send(emptyCalendar);
    }

    /* The date floor belongs in the query: fetching every event this
       organization has ever run only to drop the past ones in JS is what made
       this endpoint grow without bound. */
    const eventRelations =
      await this.eventArrangersService.findAllPublicWithEvents(arrangerId, {
        fromDate: new Date(),
      });
    const seen = new Set<string>();
    const events = eventRelations
      .map(({ event }: { event: any }) => event)
      .filter((event: any) => {
        /* An event co-arranged by two of this organization's arrangers comes
           back once per arranger. The old dedup scanned the whole array per
           element, so a busy calendar cost O(n²). */
        if (seen.has(event.id)) {
          return false;
        }
        seen.add(event.id);
        return true;
      });

    const calendar = createOrganizationCalendarIcs(
      organization,
      events,
      process.env.FRONTEND_URL,
    );

    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${getOrganizationCalendarFileName(organization)}"`,
    );
    return res.status(200).send(calendar);
  }

  @OrganizationRoles(OrganizationRole.ADMIN, OrganizationRole.OWNER)
  @UseGuards(AuthenticatedGuard, OrganizationRolesGuard)
  @Post("/:orgId/invitations")
  async sendInvitations(
    @Req() req: any,
    @Param("orgId") orgId: string,
    // The global ValidationPipe skips array bodies outright - Array is in its
    // list of types not to validate - so the decorators on
    // CreateOrganizationInvitationDto never ran and neither did whitelisting.
    // ParseArrayPipe applies both per element.
    @Body(
      new ParseArrayPipe({
        items: CreateOrganizationInvitationDto,
        whitelist: true,
      }),
    )
    createOrgInvitesDtos: CreateOrganizationInvitationDto[],
  ) {
    return this.organizationInvitationsService.createInvitations(
      orgId,
      req.user.id,
      createOrgInvitesDtos,
    );
  }

  @OrganizationRoles(OrganizationRole.ADMIN, OrganizationRole.OWNER)
  @UseGuards(AuthenticatedGuard, OrganizationRolesGuard)
  @Patch("/:orgId/roles")
  async changeUserRole(
    @Req() req: any,
    @Param("orgId") orgId: string,
    @Body() changeRoleDto: ChangeRoleDto,
  ) {
    /* fetch both organization users */
    const organizationUser =
      await this.organizationsService.getOrganizationUser(req.user.id, orgId);
    const organizationUserToEdit =
      await this.organizationsService.getOrganizationUser(
        changeRoleDto.userId,
        orgId,
      );

    if (organizationUserToEdit?.role === OrganizationRole.OWNER) {
      throw new ForbiddenException("Cannot change role of owner");
    }

    if (changeRoleDto.role === OrganizationRole.OWNER) {
      throw new ForbiddenException("Cannot change to owner");
    }

    const isEditingSelf =
      organizationUser?.userId === organizationUserToEdit?.userId;

    /* an admin can only edit members or themselves */
    if (
      !isEditingSelf &&
      organizationUser?.role === OrganizationRole.ADMIN &&
      organizationUserToEdit?.role !== OrganizationRole.MEMBER
    ) {
      throw new ForbiddenException(
        "An admin can only edit users with the role of member",
      );
    }

    // A user with no role in the organization raises P2025, which
    // PrismaExceptionFilter answers with 404 rather than the 400 this
    // used to return.
    return await this.organizationsService.changeUserRole(orgId, changeRoleDto);
  }

  @OrganizationRoles(OrganizationRole.OWNER)
  @UseGuards(AuthenticatedGuard, OrganizationRolesGuard)
  @Patch("/:orgId/owner")
  async changeOwner(
    @Req() req: any,
    @Param("orgId") orgId: string,
    @Body() changeOwnerDto: ChangeOwnerDto,
  ) {
    return await this.organizationsService.changeOwner(
      orgId,
      req.user.id,
      changeOwnerDto.newOwnerId,
    );
  }

  @UseGuards(AuthenticatedGuard, UserIdVerificationGuard)
  @Patch("/:orgId/roleDescription/:userId")
  async updateRoleDescription(
    @Req() req: any,
    @Param("userId") userId: string,
    @Param("orgId") orgId: string,
    @Body() updateRoleDto: ChangeRoleDescriptionDTO,
  ) {
    /* update your own role description in an organization
     */

    return await this.organizationsService.changeUserRoleDescription(
      orgId,
      userId,
      updateRoleDto,
    );
  }

  @UseGuards(AuthenticatedGuard)
  @Patch("/:id/invitations/:inviteId")
  async updateInvitation(
    @Req() req: any,
    @Param("id") id: string,
    @Param("inviteId") inviteId: string,
    @Body() updateInvitationDto: UpdateInvitationDto,
  ) {
    /* The toUser can update to ACCEPTED, DECLINED, and IGNORED only if the status is PENDING
     * while the fromUser can update to CANCELLED only if the status is still PENDING
     */
    const user: User = req.user;
    const organization = await this.organizationsService.findOrgWithUsers(id);
    if (!organization) {
      throw new OrganizationDoesNotExistException(id);
    }
    const invitation =
      await this.organizationInvitationsService.findOne(inviteId);
    /* The handler loaded the organization from `:id` only to 404 on it, then
       looked the invitation up by `inviteId` alone - so an invitation for one
       organization could be driven through another organization's path. No
       privilege was gained (accept applies the invitation's own organizationId),
       but the differing responses made this an existence-and-status oracle for
       arbitrary invitation ids, and any per-organization auditing or rate
       limiting on the route was meaningless. Same 404 either way, so a
       mismatched pair does not confirm the invitation exists. */
    if (!invitation || invitation.organizationId !== organization.id) {
      throw new OrganizationInvitationDoesNotExistException(inviteId);
    }

    if (invitation.invitationStatus !== InvitationStatus.PENDING) {
      throw new BadRequestException(
        "Invitation status is not PENDING, cannot update",
      );
    }

    switch (updateInvitationDto.status) {
      case InvitationStatus.ACCEPTED:
        if (invitation.toUserId === user.id) {
          return this.organizationInvitationsService.acceptInvitation(inviteId);
        }
        throw new UnauthorizedException(
          "User is not the recipient of the invitation",
        );
      case InvitationStatus.DECLINED:
        if (invitation.toUserId === user.id) {
          return this.organizationInvitationsService.declineInvitation(
            inviteId,
          );
        }
        throw new UnauthorizedException(
          "User is not the recipient of the invitation",
        );
      case InvitationStatus.IGNORED:
        if (invitation.toUserId === user.id) {
          return this.organizationInvitationsService.ignoreInvitation(inviteId);
        }
        throw new UnauthorizedException(
          "User is not the recipient of the invitation",
        );
      case InvitationStatus.CANCELLED:
        if (invitation.fromUserId === user.id) {
          return this.organizationInvitationsService.cancelInvitation(inviteId);
        }
        throw new UnauthorizedException(
          "User is not the sender of the invitation",
        );
      default:
        throw new BadRequestException(
          "You can only update to ACCEPTED, DECLINED, IGNORED, or CANCELLED",
        );
    }
  }

  @OrganizationRoles(
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
    OrganizationRole.MEMBER,
  )
  @UseGuards(AuthenticatedGuard, OrganizationRolesGuard)
  @Get(":orgId/members")
  async getMembers(@Req() req: any, @Param("orgId") orgId: string) {
    /* get events for organization
    Args:
        orgId: string - id of the organization to get events for
    Returns:
        List<UserOrganizationRole> - list of users for the organization
    */
    const organization =
      await this.organizationsService.findOrgWithUsers(orgId);
    return organization?.organizationRoles;
  }

  @OrganizationRoles(
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
    OrganizationRole.MEMBER,
  )
  @UseGuards(AuthenticatedGuard, OrganizationRolesGuard)
  @Delete(":orgId/members/:userId")
  async deleteMember(
    @Req() req: any,
    @Param("orgId") orgId: string,
    @Param("userId") userId: string,
  ) {
    // Delete a member from an organization
    // an owner can delete an admin or member
    // an admin can only delete a member
    // You can't delete yourself if you are the owner
    const organization =
      await this.organizationsService.findOrgWithUsers(orgId);
    if (!organization) {
      throw new OrganizationDoesNotExistException(orgId);
    }

    const isOwner = organization?.organizationRoles.some(
      (role) =>
        role.userId === req.user.id && role.role === OrganizationRole.OWNER,
    );
    const isAdmin = organization?.organizationRoles.some(
      (role) =>
        role.userId === req.user.id && role.role === OrganizationRole.ADMIN,
    );

    const userOrganizationRole = organization.organizationRoles.find(
      (userOrgRole) => userOrgRole.userId === userId,
    );
    if (!userOrganizationRole) {
      throw new BadRequestException("User is not part of the organization");
    }
    if (userOrganizationRole.role === OrganizationRole.OWNER) {
      throw new BadRequestException("You can't delete the owner");
    }
    if (isOwner) {
      return this.organizationsService.deleteMember(orgId, userId);
    }
    if (isAdmin && userOrganizationRole.role === OrganizationRole.MEMBER) {
      return this.organizationsService.deleteMember(orgId, userId);
    }

    // if myself, then delete
    if (req.user.id === userId) {
      return this.organizationsService.deleteMember(orgId, userId);
    }

    throw new UnauthorizedException(
      "You don't have permission to delete this user",
    );
  }

  @OrganizationRoles(OrganizationRole.OWNER, OrganizationRole.ADMIN)
  @UseGuards(AuthenticatedGuard, OrganizationRolesGuard)
  @Get(":orgId/followers")
  async getFollowers(@Param("orgId") orgId: string) {
    return this.organizationsService.getFollowers(orgId);
  }
}
