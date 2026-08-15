import { HttpStatus } from "@nestjs/common";
import { AdministrationService } from "./administration.service";

describe("AdministrationService", () => {
  const userOrganizationRole = { findUnique: jest.fn() };
  const service = new AdministrationService({ userOrganizationRole } as any);

  beforeEach(() => jest.clearAllMocks());

  it.each(["ADMIN", "OWNER"])(
    "recognizes %s as an administrator",
    async (role) => {
      userOrganizationRole.findUnique.mockResolvedValueOnce({ role });

      await expect(service.getPermissions("user-1")).resolves.toEqual({
        hasAdminAccess: true,
        isAdmin: true,
      });
      expect(userOrganizationRole.findUnique).toHaveBeenCalledWith({
        where: {
          organizationId_userId: {
            organizationId: "c997beea-620f-4b83-bb97-12f3c0b96a14",
            userId: "user-1",
          },
        },
        select: { role: true },
      });
    },
  );

  it("gives a member read-only access", async () => {
    userOrganizationRole.findUnique.mockResolvedValueOnce({ role: "MEMBER" });

    await expect(service.getPermissions("user-1")).resolves.toEqual({
      hasAdminAccess: true,
      isAdmin: false,
    });
  });

  it("rejects non-administrators from write access", async () => {
    userOrganizationRole.findUnique.mockResolvedValueOnce({ role: "MEMBER" });

    await expect(service.ensureAdmin("user-1")).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
    });
  });
});
