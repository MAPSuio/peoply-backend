import { EventArrangerRole } from "../generated/prisma/client";
import { EVENT_ARRANGER_ROLES_KEY } from "../../decorators/eventArrangerRoles.decorator";
import { EventsController } from "./events.controller";

describe("EventsController co-organizer invitation authorization", () => {
  it("restricts invitation listing to the event ADMIN", () => {
    const roles = Reflect.getMetadata(
      EVENT_ARRANGER_ROLES_KEY,
      EventsController.prototype.getCoOrganizerInvitations,
    );

    expect(roles).toEqual([EventArrangerRole.ADMIN]);
  });
});
