jest.mock("../auth.service", () => ({
  AuthService: class AuthService {},
}));

import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { OrganizationRolesGuard } from "./organizationRoles.guard";

describe("OrganizationRolesGuard", () => {
  const reflector = {
    get: jest.fn(),
  } as unknown as Reflector;
  const organizationsService = {
    findOne: jest.fn(),
    findOneByUrlId: jest.fn(),
    checkUserRole: jest.fn(),
  } as any;
  const authService = {
    validateJWT: jest.fn(),
  } as any;
  const usersService = {
    findById: jest.fn(),
  } as any;

  let guard: OrganizationRolesGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new OrganizationRolesGuard(
      reflector,
      organizationsService,
      authService,
      usersService,
    );
    reflector.get = jest.fn().mockReturnValue(["ADMIN"]);
  });

  it("resolves organization urlId before checking role", async () => {
    authService.validateJWT.mockReturnValueOnce({ sub: "user-1" });
    usersService.findById.mockResolvedValueOnce({ id: "user-1" });
    organizationsService.findOneByUrlId.mockResolvedValueOnce({
      id: "org-uuid",
    });
    organizationsService.checkUserRole.mockResolvedValueOnce(true);

    const context = {
      getHandler: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          cookies: { access: "token" },
          params: { orgId: "cyb" },
        }),
      }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(organizationsService.findOneByUrlId).toHaveBeenCalledWith("cyb");
    expect(organizationsService.checkUserRole).toHaveBeenCalledWith(
      "user-1",
      "org-uuid",
      ["ADMIN"],
    );
  });
});
