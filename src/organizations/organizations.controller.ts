import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { InvitationStatus, OrganizationRole, User } from "@prisma/client";
import { OrganizationRoles } from "../../decorators/organizationRoles.decorator";
import { EventArrangersService } from "../arrangers/services";
import { AuthenticatedGuard, OrganizationRolesGuard } from "../auth/guards";
import { CreateOrganizationInvitationDto } from "../invitations/dto/create-organizationInvitation.dto";
import { UpdateInvitationDto } from "../invitations/dto/update-invitation.dto";
import { OrganizationInvitationDoesNotExistException } from "../invitations/exceptions/organizationInvitationDoesNotExistException.exception";
import { OrganizationInvitationsService } from "../invitations/services/organizationInvitations.service";
import { ChangeRoleDto, UpdateOrganizationDto } from "./dto";
import { CreateOrganizationDto } from "./dto/create-organization.dto";
import { OrganizationDoesNotExistException } from "./exceptions";
import { OrganizationsService } from "./organizations.service";

@Controller("organizations")
export class OrganizationsController {
  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly organizationInvitationsService: OrganizationInvitationsService,
    private readonly eventArrangersService: EventArrangersService,
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

  @OrganizationRoles(OrganizationRole.ADMIN)
  @UseGuards(AuthenticatedGuard, OrganizationRolesGuard)
  @Patch("/:orgId")
  async update(
    @Req() req: any,
    @Param("orgId") orgId: string,
    @Body() updateOrganizationDto: UpdateOrganizationDto,
  ) {
    /* update organization
    Args:
        updateOrganizationDto: UpdateOrganizationDto - data to update the organization with
    Returns:
        Organization - the updated organization
    */
    return this.organizationsService.update(orgId, updateOrganizationDto);
  }

  @OrganizationRoles(OrganizationRole.ADMIN)
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

  @OrganizationRoles(OrganizationRole.ADMIN)
  @UseGuards(AuthenticatedGuard, OrganizationRolesGuard)
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
    return await this.eventArrangersService.findAllWithEvents(arrangerID);
  }

  @OrganizationRoles(OrganizationRole.ADMIN)
  @UseGuards(AuthenticatedGuard, OrganizationRolesGuard)
  @Post("/:id/invitations")
  @UseGuards(AuthenticatedGuard)
  async sendInvitations(
    @Req() req: any,
    @Param("id") id: string,
    @Body() createOrgInvitesDtos: CreateOrganizationInvitationDto[],
  ) {
    return this.organizationInvitationsService.createInvitations(
      id,
      req.user.id,
      createOrgInvitesDtos,
    );
  }

  @OrganizationRoles(OrganizationRole.ADMIN)
  @UseGuards(AuthenticatedGuard, OrganizationRolesGuard)
  @Patch("/:orgId/roles")
  async changeUserRole(
    @Param("orgId") orgId: string,
    @Body() changeRoleDto: ChangeRoleDto,
  ) {
    return this.organizationsService.changeUserRole(orgId, changeRoleDto);
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
    const invitation = await this.organizationInvitationsService.findOne(
      inviteId,
    );
    if (!invitation) {
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

  @Get(":orgId/members")
  async getMembers(@Req() req: any, @Param("orgId") orgId: string) {
    /* get events for organization
    Args:
        orgId: string - id of the organization to get events for
    Returns:
        List<UserOrganizationRole> - list of users for the organization
    */
    const organization = await this.organizationsService.findOrgWithUsers(
      orgId,
    );
    return organization?.organizationRoles;
  }
}
