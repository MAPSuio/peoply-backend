jest.mock("../auth.service", () => ({
  AuthService: class AuthService {},
}));

import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { EventArrangerRole } from "../../generated/prisma/client";
import { EVENT_ARRANGER_ROLES_KEY } from "../../../decorators/eventArrangerRoles.decorator";
import { EventRolesGuard } from "./eventRoles.guard";

/**
 * `EventArranger.role` was read nowhere for authorization, so a COLLABORATOR
 * co-organizer had every power the event's own arranger had. These cover the
 * routes that are now the owner's alone, and that the ordinary ones still let a
 * collaborator through.
 */
describe("EventRolesGuard and EventArranger.role", () => {
  const organizationsService = {
    findByArrangerId: jest.fn(),
    checkUserRole: jest.fn(),
  } as any;
  const eventsService = {
    findOneWithArrangers: jest.fn(),
    findOneWithArrangersByUrlId: jest.fn(),
  } as any;
  const authService = { validateJWT: jest.fn() } as any;
  const usersService = { findById: jest.fn() } as any;

  /**
   * @param required what @EventArrangerRoles says on the route, or undefined
   *                 for a route that does not restrict it
   */
  const guardFor = (required?: EventArrangerRole[]) => {
    const reflector = {
      get: jest.fn((key: string) =>
        key === EVENT_ARRANGER_ROLES_KEY ? required : ["ADMIN"],
      ),
    } as unknown as Reflector;

    return new EventRolesGuard(
      reflector,
      organizationsService,
      authService,
      usersService,
      {} as any,
      eventsService,
    );
  };

  const request = { cookies: { access: "token" }, params: { id: "event-1" } };

  const run = (guard: EventRolesGuard) =>
    guard.canActivate({
      getHandler: jest.fn(),
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext);

  beforeEach(() => {
    jest.clearAllMocks();
    delete (request as any).eventArrangerRole;
    authService.validateJWT.mockReturnValue({ sub: "user-1" });
    usersService.findById.mockResolvedValue({
      id: "user-1",
      arrangerId: "arranger-1",
    });
  });

  const arrangedAs = (role: EventArrangerRole) =>
    eventsService.findOneWithArrangers.mockResolvedValue({
      eventArrangers: [{ arrangerId: "arranger-1", role }],
    });

  it("lets a collaborator through a route that does not restrict the role", async () => {
    arrangedAs(EventArrangerRole.COLLABORATOR);

    await expect(run(guardFor(undefined))).resolves.toBe(true);
  });

  it("refuses a collaborator on an owner-only route", async () => {
    arrangedAs(EventArrangerRole.COLLABORATOR);

    await expect(run(guardFor([EventArrangerRole.ADMIN]))).resolves.toBe(false);
  });

  it("still lets the event's own arranger through an owner-only route", async () => {
    arrangedAs(EventArrangerRole.ADMIN);

    await expect(run(guardFor([EventArrangerRole.ADMIN]))).resolves.toBe(true);
  });

  it("exposes the matched role on the request so the handler can use it", async () => {
    arrangedAs(EventArrangerRole.COLLABORATOR);

    await run(guardFor(undefined));

    expect((request as any).eventArrangerRole).toBe(
      EventArrangerRole.COLLABORATOR,
    );
  });

  /* The org branch resolves *any* eventArrangers row, so a collaborating
     organization's admin used to arrive with the same powers too. */
  it("refuses an admin of a collaborating organization on an owner-only route", async () => {
    usersService.findById.mockResolvedValue({
      id: "user-1",
      arrangerId: "arranger-unrelated",
    });
    eventsService.findOneWithArrangers.mockResolvedValue({
      eventArrangers: [
        { arrangerId: "arranger-org", role: EventArrangerRole.COLLABORATOR },
      ],
    });
    organizationsService.findByArrangerId.mockResolvedValue({ id: "org-1" });
    organizationsService.checkUserRole.mockResolvedValue(true);

    await expect(run(guardFor([EventArrangerRole.ADMIN]))).resolves.toBe(false);
    // Short-circuited before the org lookup — no reason to ask.
    expect(organizationsService.checkUserRole).not.toHaveBeenCalled();
  });

  it("still admits an admin of the owning organization", async () => {
    usersService.findById.mockResolvedValue({
      id: "user-1",
      arrangerId: "arranger-unrelated",
    });
    eventsService.findOneWithArrangers.mockResolvedValue({
      eventArrangers: [
        { arrangerId: "arranger-org", role: EventArrangerRole.ADMIN },
      ],
    });
    organizationsService.findByArrangerId.mockResolvedValue({ id: "org-1" });
    organizationsService.checkUserRole.mockResolvedValue(true);

    await expect(run(guardFor([EventArrangerRole.ADMIN]))).resolves.toBe(true);
  });

  /* A person can be both: their own arranger row on the event as a
     collaborator, and an admin of an organization that owns it. The higher
     grant has to win rather than the first one found. */
  it("falls through to the org branch when the direct row is not enough", async () => {
    eventsService.findOneWithArrangers.mockResolvedValue({
      eventArrangers: [
        { arrangerId: "arranger-1", role: EventArrangerRole.COLLABORATOR },
        { arrangerId: "arranger-org", role: EventArrangerRole.ADMIN },
      ],
    });
    organizationsService.findByArrangerId.mockResolvedValue({ id: "org-1" });
    organizationsService.checkUserRole.mockResolvedValue(true);

    await expect(run(guardFor([EventArrangerRole.ADMIN]))).resolves.toBe(true);
  });
});
