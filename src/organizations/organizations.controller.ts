import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
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
import { InvitationStatus, OrganizationRole, User } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime";
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
import { PrismaError } from "../prisma/prisma.constants";
import {
  ChangeOwnerDto,
  ChangeRoleDescriptionDTO,
  ChangeRoleDto,
  UpdateOrganizationDto,
} from "./dto";
import { CreateOrganizationDto } from "./dto/create-organization.dto";
import { SearchOrganizationDto } from "./dto/search-organization.dto";
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

  /* endpoint to GET all orgs */
  @Get()
  async findAll(@Query() query: SearchOrganizationDto) {
    const { skip, take } = query;
    return this.organizationsService.findAll(query, skip, take);
  }

  @Get("/:orgId")
  async getOrganization(@Param("orgId") orgId: string) {
    try {
      const org = await this.organizationsService.findOne(orgId);
      if (!org) {
        throw new OrganizationDoesNotExistException(orgId);
      }
      return org;
    } catch (error) {
      if (error.code === PrismaError.DoesNotExist) {
        throw new OrganizationDoesNotExistException(orgId);
      }

      throw error;
    }
  }

  @OrganizationRoles(OrganizationRole.ADMIN, OrganizationRole.OWNER)
  @UseGuards(AuthenticatedGuard, OrganizationRolesGuard)
  @UseInterceptors(
    FileInterceptor("orgImage", {
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
    return await this.eventArrangersService.findAllWithEvents(arrangerID);
  }

  @OrganizationRoles(OrganizationRole.ADMIN, OrganizationRole.OWNER)
  @UseGuards(AuthenticatedGuard, OrganizationRolesGuard)
  @Post("/:id/invitations")
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

    try {
      return await this.organizationsService.changeUserRole(
        orgId,
        changeRoleDto,
      );
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === PrismaError.EntityNotFound
      ) {
        throw new BadRequestException("Can't find user in organization");
      }
      throw error;
    }
  }

  @OrganizationRoles(OrganizationRole.OWNER)
  @UseGuards(AuthenticatedGuard, OrganizationRolesGuard)
  @Patch("/:orgId/owner")
  async changeOwner(
    @Req() req: any,
    @Param("orgId") orgId: string,
    @Body() changeOwnerDto: ChangeOwnerDto,
  ) {
    try {
      return await this.organizationsService.changeOwner(
        orgId,
        req.user.id,
        changeOwnerDto.newOwnerId,
      );
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === PrismaError.EntityNotFound
      ) {
        throw new BadRequestException(
          "New owner is not part of the organization",
        );
      }
      throw error;
    }
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

    try {
      return await this.organizationsService.changeUserRoleDescription(
        orgId,
        userId,
        updateRoleDto,
      );
    } catch (exception) {
      if (
        exception instanceof PrismaClientKnownRequestError &&
        exception.code === PrismaError.EntityNotFound
      ) {
        throw new BadRequestException(
          "Cant find a user with a role in this organization",
        );
      }
      throw exception;
    }
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
    const organization = await this.organizationsService.findOrgWithUsers(
      orgId,
    );
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
}
