import {
  Body,
  Controller,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { AuthenticatedGuard } from "../auth/guards";
import { UpdateOrganizationDto } from "./dto";
import { CreateOrganizationDto } from "./dto/create-organization.dto";
import { OrganizationDoesNotExistException } from "./exceptions";
import { OrganizationsService } from "./organizations.service";

@Controller("organizations")
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

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

  @UseGuards(AuthenticatedGuard)
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
    const organization = await this.organizationsService.findOrgWithUsers(
      orgId,
    );
    if (!organization) {
      throw new OrganizationDoesNotExistException(orgId);
    }
    const usersRoles = organization.organizationRoles;

    for (const userRole of usersRoles) {
      if (userRole.userId === req.user.id && userRole.role === "ADMIN") {
        return this.organizationsService.update(orgId, updateOrganizationDto);
      }
    }
    throw new UnauthorizedException("User is not an admin of the organization");
  }
}
