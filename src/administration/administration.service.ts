import { ForbiddenException, Injectable } from "@nestjs/common";
import { OrganizationRole } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";

const ADMIN_ORGANIZATION_ID = "c997beea-620f-4b83-bb97-12f3c0b96a14";

@Injectable()
export class AdministrationService {
  constructor(private readonly prisma: PrismaService) {}

  async getPermissions(userId: string) {
    const membership = await this.prisma.userOrganizationRole.findUnique({
      where: {
        organizationId_userId: {
          organizationId: ADMIN_ORGANIZATION_ID,
          userId,
        },
      },
      select: { role: true },
    });
    const role = membership?.role;

    return {
      hasAdminAccess: role !== undefined,
      isAdmin:
        role === OrganizationRole.ADMIN || role === OrganizationRole.OWNER,
    };
  }

  async ensureAccess(userId: string) {
    if (!(await this.getPermissions(userId)).hasAdminAccess) {
      throw new ForbiddenException("Du har ikke tilgang til adminområdet");
    }
  }

  async ensureAdmin(userId: string) {
    if (!(await this.getPermissions(userId)).isAdmin) {
      throw new ForbiddenException("Du må være administrator");
    }
  }
}
