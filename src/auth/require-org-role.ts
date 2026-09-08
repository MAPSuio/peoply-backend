import { applyDecorators, UseGuards } from "@nestjs/common";

import { OrganizationRoles } from "../../decorators/organizationRoles.decorator";
import { OrganizationRolesGuard } from "./guards/organizationRoles.guard";
import { OrganizationRole } from "../generated/prisma/client";

export const RequireOrgRole = (...roles: OrganizationRole[]) =>
  applyDecorators(
    OrganizationRoles(...roles),
    UseGuards(OrganizationRolesGuard),
  );
