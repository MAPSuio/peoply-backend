import { OrganizationRole, RegStatus } from "../generated/prisma/client";
import { EventRolesGuard } from "../auth/guards/eventRoles.guard";
import { IS_PUBLIC_ROUTE } from "../auth/public.decorator";
import { IsArrangerInterceptor } from "../auth/interceptors/isArranger.interceptor";
import { EventsController } from "./events.controller";

const EVENT_ID = "event-1";
const USER_ID = "user-1";

function buildController() {
  const arrangerRegistrationService = {
    findAll: jest.fn().mockResolvedValue([]),
    getRegistrationCount: jest.fn().mockResolvedValue(4),
    update: jest.fn().mockResolvedValue({ regStatus: RegStatus.NOT_GOING }),
    remove: jest.fn().mockResolvedValue({ userId: USER_ID }),
  };

  return {
    arrangerRegistrationService,
    controller: new EventsController(
      {} as never,
      {} as never,
      arrangerRegistrationService as never,
      {} as never,
      {} as never,
    ),
  };
}

describe("EventsController registration routes", () => {
  it("lists the registrations of the event in the path", async () => {
    const { controller, arrangerRegistrationService } = buildController();
    const query = { regStatus: RegStatus.WAITLISTED } as any;

    await controller.getRegistrations(query, EVENT_ID);

    expect(arrangerRegistrationService.findAll).toHaveBeenCalledWith(
      query,
      EVENT_ID,
    );
  });

  it.each([true, false, undefined])(
    "passes the caller's arranger status (%p) on to the count",
    async (isArranger) => {
      const { controller, arrangerRegistrationService } = buildController();
      const query = { regStatus: RegStatus.GOING } as any;

      await controller.getRegistrationCount({ isArranger }, query, EVENT_ID);

      expect(
        arrangerRegistrationService.getRegistrationCount,
      ).toHaveBeenCalledWith(query, EVENT_ID, isArranger);
    },
  );

  it("changes the registration of the user in the path, on the event in the path", async () => {
    const { controller, arrangerRegistrationService } = buildController();
    const dto = { regStatus: RegStatus.BANNED } as any;

    await controller.updateUserRegistration({}, USER_ID, EVENT_ID, dto);

    expect(arrangerRegistrationService.update).toHaveBeenCalledWith(
      USER_ID,
      EVENT_ID,
      dto,
    );
  });

  it("deletes the registration with the event first, as the service reads it", async () => {
    const { controller, arrangerRegistrationService } = buildController();

    await controller.deleteUserRegistration({}, EVENT_ID, USER_ID);

    expect(arrangerRegistrationService.remove).toHaveBeenCalledWith(
      EVENT_ID,
      USER_ID,
    );
  });
});

describe("EventsController registration routes access rules", () => {
  const arrangerOnlyHandlers = [
    ["getRegistrations", EventsController.prototype.getRegistrations],
    [
      "updateUserRegistration",
      EventsController.prototype.updateUserRegistration,
    ],
    [
      "deleteUserRegistration",
      EventsController.prototype.deleteUserRegistration,
    ],
  ] as const;

  it.each(arrangerOnlyHandlers)(
    "%s is for the event's arrangers only",
    (_name, handler) => {
      expect(Reflect.getMetadata(IS_PUBLIC_ROUTE, handler)).toBeUndefined();
      expect(Reflect.getMetadata("__guards__", handler)).toEqual([
        EventRolesGuard,
      ]);
      expect(Reflect.getMetadata("roles", handler)).toEqual([
        OrganizationRole.ADMIN,
        OrganizationRole.OWNER,
      ]);
    },
  );

  it("counts registrations publicly, but only through the interceptor that decides who is an arranger", () => {
    const handler = EventsController.prototype.getRegistrationCount;

    expect(Reflect.getMetadata(IS_PUBLIC_ROUTE, handler)).toBe(true);
    expect(Reflect.getMetadata("__interceptors__", handler)).toEqual([
      IsArrangerInterceptor,
    ]);
    expect(Reflect.getMetadata("__guards__", handler)).toBeUndefined();
  });
});
