import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import { OrganizationRole } from "../generated/prisma/client";
import { OrganizationRoles } from "../../decorators/organizationRoles.decorator";
import { OrganizationRolesGuard } from "../auth/guards";
import { IcsFeedsService } from "./ics-feeds.service";
import { UpsertOrganizationIcsFeedDto } from "./dto/upsert-organization-ics-feed.dto";

@Controller("organizations/:orgId/ics-feed")
export class IcsFeedsController {
  constructor(private readonly icsFeedsService: IcsFeedsService) {}

  @OrganizationRoles(OrganizationRole.ADMIN, OrganizationRole.OWNER)
  @UseGuards(OrganizationRolesGuard)
  @Get()
  async getOrganizationFeed(@Param("orgId") orgId: string) {
    return this.icsFeedsService.getOrganizationFeed(orgId);
  }

  @OrganizationRoles(OrganizationRole.ADMIN, OrganizationRole.OWNER)
  @UseGuards(OrganizationRolesGuard)
  @Put()
  async upsertOrganizationFeed(
    @Param("orgId") orgId: string,
    @Body() dto: UpsertOrganizationIcsFeedDto,
  ) {
    return this.icsFeedsService.upsertOrganizationFeed(orgId, dto);
  }

  @OrganizationRoles(OrganizationRole.ADMIN, OrganizationRole.OWNER)
  @UseGuards(OrganizationRolesGuard)
  @Delete()
  async deleteOrganizationFeed(@Param("orgId") orgId: string) {
    return this.icsFeedsService.deleteOrganizationFeed(orgId);
  }

  @OrganizationRoles(OrganizationRole.ADMIN, OrganizationRole.OWNER)
  @UseGuards(OrganizationRolesGuard)
  @Post("sync")
  async syncOrganizationFeed(@Param("orgId") orgId: string) {
    return this.icsFeedsService.syncOrganizationFeed(orgId);
  }
}
