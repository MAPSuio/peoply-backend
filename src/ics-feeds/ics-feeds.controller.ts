import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from "@nestjs/common";
import { OrganizationRole } from "../generated/prisma/client";
import { RequireOrgRole } from "../auth/require-org-role";
import { IcsFeedsService } from "./ics-feeds.service";
import { UpsertOrganizationIcsFeedDto } from "./dto/upsert-organization-ics-feed.dto";

@Controller("organizations/:orgId/ics-feed")
export class IcsFeedsController {
  constructor(private readonly icsFeedsService: IcsFeedsService) {}

  @RequireOrgRole(OrganizationRole.ADMIN, OrganizationRole.OWNER)
  @Get()
  async getOrganizationFeed(@Param("orgId") orgId: string) {
    return this.icsFeedsService.getOrganizationFeed(orgId);
  }

  @RequireOrgRole(OrganizationRole.ADMIN, OrganizationRole.OWNER)
  @Put()
  async upsertOrganizationFeed(
    @Param("orgId") orgId: string,
    @Body() dto: UpsertOrganizationIcsFeedDto,
  ) {
    return this.icsFeedsService.upsertOrganizationFeed(orgId, dto);
  }

  @RequireOrgRole(OrganizationRole.ADMIN, OrganizationRole.OWNER)
  @Delete()
  async deleteOrganizationFeed(@Param("orgId") orgId: string) {
    return this.icsFeedsService.deleteOrganizationFeed(orgId);
  }

  @RequireOrgRole(OrganizationRole.ADMIN, OrganizationRole.OWNER)
  @Post("sync")
  async syncOrganizationFeed(@Param("orgId") orgId: string) {
    return this.icsFeedsService.syncOrganizationFeed(orgId);
  }
}
