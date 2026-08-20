import { OrganizationsController } from "./organizations.controller";
import { AuthenticatedGuard } from "../auth/guards/authenticated.guard";
import { OrganizationRolesGuard } from "../auth/guards/organizationRoles.guard";
import { OrganizationRole } from "../generated/prisma/client";

/* The access rule IS the feature's security requirement: analytics is
   visible to every org role and to nobody else. Asserting on the route
   metadata pins that without booting the Nest module. */
describe("OrganizationsController analytics route", () => {
  const handler = OrganizationsController.prototype.getAnalytics;

  it("exists", () => {
    expect(typeof handler).toBe("function");
  });

  it("allows all three organization roles", () => {
    const roles = Reflect.getMetadata("roles", handler);
    expect(roles).toEqual(
      expect.arrayContaining([
        OrganizationRole.OWNER,
        OrganizationRole.ADMIN,
        OrganizationRole.MEMBER,
      ]),
    );
    expect(roles).toHaveLength(3);
  });

  it("is protected by the authentication and organization-role guards", () => {
    const guards = Reflect.getMetadata("__guards__", handler);
    expect(guards).toEqual([AuthenticatedGuard, OrganizationRolesGuard]);
  });

  it("is mounted at :orgId/analytics so the guard can resolve the org param", () => {
    expect(Reflect.getMetadata("path", handler)).toBe(":orgId/analytics");
    // 0 is RequestMethod.GET in Nest's routing metadata.
    expect(Reflect.getMetadata("method", handler)).toBe(0);
  });
});
