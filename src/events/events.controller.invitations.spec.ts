import { GUARDS_METADATA } from "@nestjs/common/constants";
import { THROTTLER_LIMIT } from "@nestjs/throttler/dist/throttler.constants";
import { EventRolesGuard } from "../auth/guards/eventRoles.guard";
import { PER_ROUTE_THROTTLER } from "../rate-limit";
import { EventsController } from "./events.controller";

describe("EventsController event invitation routes", () => {
  const guardsOf = (handler: unknown) =>
    Reflect.getMetadata(GUARDS_METADATA, handler as object) ?? [];

  it("lets any signed-in user reach the invite route", () => {
    expect(guardsOf(EventsController.prototype.sendInvitations)).not.toContain(
      EventRolesGuard,
    );
  });

  it("rate limits the invite route below the default allowance", () => {
    const limit = Reflect.getMetadata(
      THROTTLER_LIMIT + PER_ROUTE_THROTTLER,
      EventsController.prototype.sendInvitations,
    );

    expect(limit).toBeLessThanOrEqual(10);
  });

  it("keeps the list of invitations to arrangers", () => {
    expect(guardsOf(EventsController.prototype.getInvitations)).toContain(
      EventRolesGuard,
    );
  });
});
