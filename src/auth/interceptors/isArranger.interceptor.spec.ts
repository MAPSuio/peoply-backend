jest.mock("../auth.service", () => ({
  AuthService: class AuthService {},
}));

import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { EventArrangerRole, User } from "../../generated/prisma/client";
import { EVENT_ARRANGER_ROLES_KEY } from "../../../decorators/eventArrangerRoles.decorator";
import { EventNotFoundException } from "../../events/exceptions";
import { IsArrangerInterceptor } from "./isArranger.interceptor";

/**
 * Plumbing only: the role matrix is EventAccessService's, covered by its
 * table-driven spec. What is the interceptor's own is resolving the caller,
 * forwarding the decorators, and failing soft - a request must never die
 * because the arranger lookup did.
 */
describe("IsArrangerInterceptor", () => {
  const authService = { validateJWT: jest.fn() } as any;
  const usersService = { findById: jest.fn() } as any;
  const eventAccess = { arrangerRoleFor: jest.fn() } as any;

  const user = { id: "user-1", arrangerId: "arranger-user-1" } as User;
  const next = { handle: jest.fn() } as any;

  let interceptor: IsArrangerInterceptor;
  let req: any;

  const reflectorFor = (arrangerRoles?: EventArrangerRole[]) =>
    ({
      get: jest.fn((key: string) =>
        key === EVENT_ARRANGER_ROLES_KEY ? arrangerRoles : ["ADMIN"],
      ),
    }) as unknown as Reflector;

  const run = () =>
    interceptor.intercept(
      {
        getHandler: jest.fn(),
        switchToHttp: () => ({ getRequest: () => req }),
      } as unknown as ExecutionContext,
      next,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    req = { cookies: { access: "token" }, params: { id: "event-1" } };
    interceptor = new IsArrangerInterceptor(
      authService,
      usersService,
      reflectorFor([EventArrangerRole.ADMIN]),
      eventAccess,
    );
    authService.validateJWT.mockReturnValue({ sub: "user-1" });
    usersService.findById.mockResolvedValue(user);
    eventAccess.arrangerRoleFor.mockResolvedValue(EventArrangerRole.ADMIN);
  });

  it("exposes the user and their arranger status on the request", async () => {
    await run();

    expect(req.user).toBe(user);
    expect(req.isArranger).toBe(true);
    expect(next.handle).toHaveBeenCalled();
  });

  it("hands the route params and both decorators to EventAccessService", async () => {
    await run();

    expect(eventAccess.arrangerRoleFor).toHaveBeenCalledWith(
      user,
      { id: "event-1", urlId: undefined },
      {
        allowedArrangerRoles: [EventArrangerRole.ADMIN],
        orgRoles: ["ADMIN"],
      },
    );
  });

  it("reports false when no role resolves", async () => {
    eventAccess.arrangerRoleFor.mockResolvedValueOnce(null);

    await run();

    expect(req.isArranger).toBe(false);
  });

  it("reports false when the arranger lookup throws, and still continues", async () => {
    eventAccess.arrangerRoleFor.mockRejectedValueOnce(
      new EventNotFoundException("event-1"),
    );

    await run();

    expect(req.user).toBe(user);
    expect(req.isArranger).toBe(false);
    expect(next.handle).toHaveBeenCalled();
  });

  it("leaves both unset-but-false when the token is invalid", async () => {
    authService.validateJWT.mockImplementationOnce(() => {
      throw new Error("invalid token");
    });

    await run();

    expect(req.user).toBeUndefined();
    expect(req.isArranger).toBe(false);
    expect(next.handle).toHaveBeenCalled();
  });

  it("reports false when the token resolves to no user", async () => {
    usersService.findById.mockResolvedValueOnce(null);

    await run();

    expect(req.user).toBeUndefined();
    expect(req.isArranger).toBe(false);
    expect(eventAccess.arrangerRoleFor).not.toHaveBeenCalled();
  });
});
