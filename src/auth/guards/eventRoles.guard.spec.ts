jest.mock("../auth.service", () => ({
  AuthService: class AuthService {},
}));

import { ExecutionContext, NotFoundException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { EventRolesGuard } from "./eventRoles.guard";
import { RolesNotFoundException } from "../exceptions/rolesNotFound.exception";

describe("EventRolesGuard", () => {
  const reflector = { get: jest.fn() } as unknown as Reflector;
  const organizationsService = {
    findByArrangerId: jest.fn(),
    checkUserRole: jest.fn(),
  } as any;
  const eventsService = {
    findOneWithArrangers: jest.fn(),
    findOneWithArrangersByUrlId: jest.fn(),
  } as any;
  const authService = { requireValidAccessToken: jest.fn() } as any;
  const usersService = { findById: jest.fn() } as any;
  const prisma = {} as any;

  let guard: EventRolesGuard;

  /** An event the user arranges directly, so the org lookup is skipped. */
  const direct = { eventArrangers: [{ arrangerId: "arranger-user-1" }] };

  const run = (params: any = { id: "event-1" }) => {
    const context = {
      getHandler: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ cookies: { access: "token" }, params }),
      }),
    } as unknown as ExecutionContext;
    return guard.canActivate(context);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new EventRolesGuard(
      reflector,
      organizationsService,
      authService,
      usersService,
      prisma,
      eventsService,
    );
    reflector.get = jest.fn().mockReturnValue(["ADMIN"]);
    authService.requireValidAccessToken.mockReturnValue({ sub: "user-1" });
    usersService.findById.mockResolvedValue({
      id: "user-1",
      arrangerId: "arranger-user-1",
    });
  });

  it("throws when the handler declares no roles", async () => {
    reflector.get = jest.fn().mockReturnValue(undefined);

    await expect(run()).rejects.toBeInstanceOf(RolesNotFoundException);
  });

  describe("resolving the event from route params", () => {
    it("looks the event up by id when id is present", async () => {
      eventsService.findOneWithArrangers.mockResolvedValueOnce(direct);

      await expect(run({ id: "event-1" })).resolves.toBe(true);
      expect(eventsService.findOneWithArrangers).toHaveBeenCalledWith(
        "event-1",
      );
      expect(eventsService.findOneWithArrangersByUrlId).not.toHaveBeenCalled();
    });

    it("falls back to urlId when id is absent", async () => {
      eventsService.findOneWithArrangersByUrlId.mockResolvedValueOnce(direct);

      await expect(run({ urlId: "my-event" })).resolves.toBe(true);
      expect(eventsService.findOneWithArrangersByUrlId).toHaveBeenCalledWith(
        "my-event",
      );
      expect(eventsService.findOneWithArrangers).not.toHaveBeenCalled();
    });

    it("prefers id over urlId when the route supplies both", async () => {
      eventsService.findOneWithArrangers.mockResolvedValueOnce(direct);

      // The only case where the two lookups can disagree, and so the only
      // one that pins the precedence rather than just the happy path.
      await expect(run({ id: "event-1", urlId: "my-event" })).resolves.toBe(
        true,
      );
      expect(eventsService.findOneWithArrangers).toHaveBeenCalledWith(
        "event-1",
      );
      expect(eventsService.findOneWithArrangersByUrlId).not.toHaveBeenCalled();
    });

    it("throws when neither id nor urlId is present", async () => {
      await expect(run({})).rejects.toBeInstanceOf(NotFoundException);
      expect(eventsService.findOneWithArrangers).not.toHaveBeenCalled();
      expect(eventsService.findOneWithArrangersByUrlId).not.toHaveBeenCalled();
    });
  });

  describe("role resolution", () => {
    it("returns false when the token resolves to no user", async () => {
      usersService.findById.mockResolvedValueOnce(null);
      eventsService.findOneWithArrangers.mockResolvedValueOnce(direct);

      await expect(run()).resolves.toBe(false);
    });

    it("skips arrangers that are individuals and keeps checking orgs", async () => {
      eventsService.findOneWithArrangers.mockResolvedValueOnce({
        eventArrangers: [
          { arrangerId: "arranger-individual" },
          { arrangerId: "arranger-org" },
        ],
      });
      organizationsService.findByArrangerId
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: "org-1" });
      organizationsService.checkUserRole.mockResolvedValueOnce(true);

      await expect(run()).resolves.toBe(true);
      expect(organizationsService.checkUserRole).toHaveBeenCalledWith(
        "user-1",
        "org-1",
        ["ADMIN"],
      );
    });

    it("returns false when the user holds no role in any arranging org", async () => {
      eventsService.findOneWithArrangers.mockResolvedValueOnce({
        eventArrangers: [{ arrangerId: "arranger-org" }],
      });
      organizationsService.findByArrangerId.mockResolvedValueOnce({
        id: "org-1",
      });
      organizationsService.checkUserRole.mockResolvedValueOnce(false);

      await expect(run()).resolves.toBe(false);
    });
  });
});
