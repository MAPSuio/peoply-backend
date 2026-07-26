import { SetMetadata } from "@nestjs/common";
import { OrganizationRole } from "../src/generated/prisma/client";

export const OrganizationRoles = (...roles: OrganizationRole[]) =>
  SetMetadata("roles", roles);
