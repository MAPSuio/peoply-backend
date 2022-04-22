import { SetMetadata } from "@nestjs/common";
import { OrganizationRole } from "@prisma/client";

export const OrganizationRoles = (...roles: OrganizationRole[]) =>
  SetMetadata("roles", roles);
