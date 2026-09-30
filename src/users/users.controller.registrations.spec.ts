import { HttpStatus, NotFoundException } from "@nestjs/common";
import { RegStatus } from "../generated/prisma/client";
import { IS_PUBLIC_ROUTE } from "../auth/public.decorator";
import { UserIdVerificationGuard } from "../auth/guards/userIdVerification.guard";
import { UsersController } from "./users.controller";

const USER_ID = "user-1";
const EVENT_ID = "event-1";

function buildController() {
  const userRegistrationService = {
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    getPositionInWaitlist: jest.fn().mockResolvedValue(3),
    update: jest.fn().mockResolvedValue(undefined),
    create: jest.fn().mockResolvedValue({ id: "registration-1" }),
  };

  return {
    userRegistrationService,
    controller: new UsersController(
      userRegistrationService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    ),
  };
}

describe("UsersController registration routes", () => {
  it("lists the registrations of the user in the path, not of the caller", async () => {
    const { controller, userRegistrationService } = buildController();
    const query = { regStatus: RegStatus.GOING } as any;

    await controller.getRegistrations({}, query, USER_ID);

    expect(userRegistrationService.findAll).toHaveBeenCalledWith(
      query,
      USER_ID,
    );
  });

  it("answers 204 rather than a body when the user never registered", async () => {
    const { controller, userRegistrationService } = buildController();
    const res = { status: jest.fn() } as any;

    const registration = await controller.getSingleRegistrations(
      USER_ID,
      EVENT_ID,
      res,
    );

    expect(userRegistrationService.findOne).toHaveBeenCalledWith(
      EVENT_ID,
      USER_ID,
    );
    expect(res.status).toHaveBeenCalledWith(HttpStatus.NO_CONTENT);
    expect(registration).toBeNull();
  });

  it("leaves the status alone when the registration is there", async () => {
    const { controller, userRegistrationService } = buildController();
    userRegistrationService.findOne.mockResolvedValue({
      eventId: EVENT_ID,
      userId: USER_ID,
      regStatus: RegStatus.WAITLISTED,
    });
    const res = { status: jest.fn() } as any;

    await controller.getSingleRegistrations(USER_ID, EVENT_ID, res);

    expect(res.status).not.toHaveBeenCalled();
  });

  it("refuses a waitlist position for a registration that does not exist", async () => {
    const { controller, userRegistrationService } = buildController();

    await expect(
      controller.getWaitlistPosition(USER_ID, EVENT_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(
      userRegistrationService.getPositionInWaitlist,
    ).not.toHaveBeenCalled();
  });

  it("answers the waitlist position once the registration is there", async () => {
    const { controller, userRegistrationService } = buildController();
    userRegistrationService.findOne.mockResolvedValue({
      eventId: EVENT_ID,
      userId: USER_ID,
      regStatus: RegStatus.WAITLISTED,
    });

    await expect(
      controller.getWaitlistPosition(USER_ID, EVENT_ID),
    ).resolves.toBe(3);
    expect(userRegistrationService.getPositionInWaitlist).toHaveBeenCalledWith(
      EVENT_ID,
      USER_ID,
    );
  });

  it("registers and updates on behalf of the user in the path", async () => {
    const { controller, userRegistrationService } = buildController();
    const dto = { eventId: EVENT_ID, regStatus: RegStatus.GOING } as any;

    await controller.createRegistration(USER_ID, dto);
    await controller.updateRegistration(USER_ID, dto);

    expect(userRegistrationService.create).toHaveBeenCalledWith(USER_ID, dto);
    expect(userRegistrationService.update).toHaveBeenCalledWith(USER_ID, dto);
  });
});

describe("UsersController registration routes access rules", () => {
  const handlers = [
    ["getRegistrations", UsersController.prototype.getRegistrations],
    [
      "getSingleRegistrations",
      UsersController.prototype.getSingleRegistrations,
    ],
    ["getWaitlistPosition", UsersController.prototype.getWaitlistPosition],
    ["updateRegistration", UsersController.prototype.updateRegistration],
    ["createRegistration", UsersController.prototype.createRegistration],
  ] as const;

  it.each(handlers)(
    "%s lets nobody but the user themselves through",
    (_name, handler) => {
      expect(Reflect.getMetadata(IS_PUBLIC_ROUTE, handler)).toBeUndefined();
      expect(Reflect.getMetadata("__guards__", handler)).toEqual([
        UserIdVerificationGuard,
      ]);
    },
  );

  it.each(handlers)(
    "%s is mounted under the user's own id",
    (_name, handler) => {
      expect(Reflect.getMetadata("path", handler)).toMatch(
        /^:userId\/registrations/,
      );
    },
  );
});
