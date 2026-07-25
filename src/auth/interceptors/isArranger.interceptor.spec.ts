jest.mock("../auth.service", () => ({
  AuthService: class AuthService {},
}));

import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { User } from "@prisma/client";
import { IsArrangerInterceptor } from "./isArranger.interceptor";

describe("IsArrangerInterceptor", () => {
  const reflector = {
    get: jest.fn(),
  } as unknown as Reflector;
  const organizationsService = {
    findByArrangerId: jest.fn(),
    checkUserRole: jest.fn(),
  } as any;
  const eventsService = {
    findOneWithArrangers: jest.fn(),
    findOneWithArrangersByUrlId: jest.fn(),
  } as any;
  const authService = {
    validateJWT: jest.fn(),
  } as any;
  const usersService = {
    findById: jest.fn(),
  } as any;

  let interceptor: IsArrangerInterceptor;

  const user = { id: "user-1", arrangerId: "arranger-user-1" } as User;

  const buildContext = () =>
    ({
      getHandler: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          cookies: { access: "token" },
          params: { id: "event-1" },
        }),
      }),
    }) as unknown as ExecutionContext;

  // isArranger is private; exercise it through the public interceptor surface
  const runIsArranger = async () => {
    const context = buildContext();
    const req: any = { params: { id: "event-1" } };
    return (interceptor as any).isArranger(context, req, user);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    interceptor = new IsArrangerInterceptor(
      authService,
      usersService,
      reflector,
      organizationsService,
      eventsService,
    );
    reflector.get = jest.fn().mockReturnValue(["ADMIN"]);
  });

  it("keeps checking later arrangers when an earlier one is an individual", async () => {
    eventsService.findOneWithArrangers.mockResolvedValueOnce({
      eventArrangers: [
        { arrangerId: "arranger-individual" },
        { arrangerId: "arranger-org" },
      ],
    });
    // first arranger is an individual (no organization), second is an org
    organizationsService.findByArrangerId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "org-1" });
    organizationsService.checkUserRole.mockResolvedValueOnce(true);

    await expect(runIsArranger()).resolves.toBe(true);
    expect(organizationsService.findByArrangerId).toHaveBeenCalledTimes(2);
    expect(organizationsService.checkUserRole).toHaveBeenCalledWith(
      "user-1",
      "org-1",
      ["ADMIN"],
    );
  });

  it("keeps checking later arrangers when the user has no role in an earlier org", async () => {
    eventsService.findOneWithArrangers.mockResolvedValueOnce({
      eventArrangers: [
        { arrangerId: "arranger-org-a" },
        { arrangerId: "arranger-org-b" },
      ],
    });
    organizationsService.findByArrangerId
      .mockResolvedValueOnce({ id: "org-a" })
      .mockResolvedValueOnce({ id: "org-b" });
    organizationsService.checkUserRole
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await expect(runIsArranger()).resolves.toBe(true);
    expect(organizationsService.checkUserRole).toHaveBeenCalledTimes(2);
  });

  it("returns false when the user holds no role in any arranging organization", async () => {
    eventsService.findOneWithArrangers.mockResolvedValueOnce({
      eventArrangers: [
        { arrangerId: "arranger-org-a" },
        { arrangerId: "arranger-org-b" },
      ],
    });
    organizationsService.findByArrangerId
      .mockResolvedValueOnce({ id: "org-a" })
      .mockResolvedValueOnce({ id: "org-b" });
    organizationsService.checkUserRole
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false);

    await expect(runIsArranger()).resolves.toBe(false);
  });

  it("returns true immediately when the user is a direct arranger of the event", async () => {
    eventsService.findOneWithArrangers.mockResolvedValueOnce({
      eventArrangers: [{ arrangerId: "arranger-user-1" }],
    });

    await expect(runIsArranger()).resolves.toBe(true);
    expect(organizationsService.findByArrangerId).not.toHaveBeenCalled();
  });
});
