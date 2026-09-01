import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { EventArrangerRole } from "../../generated/prisma/client";
import { EVENT_ARRANGER_ROLES_KEY } from "../../../decorators/eventArrangerRoles.decorator";
import { EventRolesGuard } from "./eventRoles.guard";
import { RolesNotFoundException } from "../exceptions/rolesNotFound.exception";

/**
 * Plumbing only: the role matrix itself is EventAccessService's, and is
 * covered by its table-driven spec. What is the guard's own is reading the
 * decorators, resolving the caller, and exposing the matched role on the
 * request.
 */
describe("EventRolesGuard", () => {
  const accessSession = { userFromRequest: jest.fn() } as any;
  const eventAccess = { arrangerRoleFor: jest.fn() } as any;

  const user = { id: "user-1", arrangerId: "arranger-user-1" };
  const request: any = {
    cookies: { access: "token" },
    params: { id: "event-1", urlId: "my-event" },
  };

  const guardFor = (arrangerRoles?: EventArrangerRole[]) => {
    const reflector = {
      get: jest.fn((key: string) =>
        key === EVENT_ARRANGER_ROLES_KEY ? arrangerRoles : ["ADMIN"],
      ),
    } as unknown as Reflector;

    return new EventRolesGuard(reflector, accessSession, eventAccess);
  };

  const run = (guard: EventRolesGuard) =>
    guard.canActivate({
      getHandler: jest.fn(),
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext);

  beforeEach(() => {
    jest.clearAllMocks();
    delete request.eventArrangerRole;
    accessSession.userFromRequest.mockResolvedValue(user);
    eventAccess.arrangerRoleFor.mockResolvedValue(EventArrangerRole.ADMIN);
  });

  it("throws when the handler declares no organization roles", async () => {
    const guard = new EventRolesGuard(
      { get: jest.fn().mockReturnValue(undefined) } as unknown as Reflector,
      accessSession,
      eventAccess,
    );

    await expect(run(guard)).rejects.toBeInstanceOf(RolesNotFoundException);
  });

  it("refuses the caller when the token resolves to no user, without consulting EventAccess", async () => {
    accessSession.userFromRequest.mockRejectedValueOnce(
      new UnauthorizedException(),
    );

    await expect(run(guardFor())).rejects.toThrow(UnauthorizedException);
    expect(eventAccess.arrangerRoleFor).not.toHaveBeenCalled();
  });

  it("hands the route params and both decorators to EventAccessService", async () => {
    await run(guardFor([EventArrangerRole.ADMIN]));

    expect(eventAccess.arrangerRoleFor).toHaveBeenCalledWith(
      user,
      { id: "event-1", urlId: "my-event" },
      {
        allowedArrangerRoles: [EventArrangerRole.ADMIN],
        orgRoles: ["ADMIN"],
      },
    );
  });

  it("admits the caller and exposes the matched role on the request", async () => {
    eventAccess.arrangerRoleFor.mockResolvedValueOnce(
      EventArrangerRole.COLLABORATOR,
    );

    await expect(run(guardFor())).resolves.toBe(true);
    /* Read downstream to decide whether the co-organizer list may be
       edited, which cannot be expressed as a whole-route rule. */
    expect(request.eventArrangerRole).toBe(EventArrangerRole.COLLABORATOR);
  });

  it("refuses the caller when no role resolves", async () => {
    eventAccess.arrangerRoleFor.mockResolvedValueOnce(null);

    await expect(run(guardFor())).resolves.toBe(false);
    expect(request.eventArrangerRole).toBeUndefined();
  });
});
