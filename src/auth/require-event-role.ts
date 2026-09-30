import { applyDecorators, UseGuards } from "@nestjs/common";

import { OrganizationRoles } from "../../decorators/organizationRoles.decorator";
import { EventRolesGuard } from "./guards/eventRoles.guard";
import { OrganizationRole } from "../generated/prisma/client";

export const RequireEventRole = (...roles: OrganizationRole[]) =>
  applyDecorators(OrganizationRoles(...roles), UseGuards(EventRolesGuard));
