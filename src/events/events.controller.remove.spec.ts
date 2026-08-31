import { ArgumentMetadata, ParseUUIDPipe } from "@nestjs/common";
import { EventsController } from "./events.controller";

const EVENT_ID = "6f1d6a1e-0b2a-4a5a-9c3e-1f2a3b4c5d6e";

function buildController() {
  const eventsService = { remove: jest.fn().mockResolvedValue(undefined) };

  return {
    eventsService,
    controller: new EventsController(
      {} as never,
      eventsService as never,
      {} as never,
      {} as never,
      {} as never,
    ),
  };
}

describe("EventsController.remove", () => {
  it("forwards the route id to the service", async () => {
    const { controller, eventsService } = buildController();

    await controller.remove(EVENT_ID);

    expect(eventsService.remove).toHaveBeenCalledWith(EVENT_ID);
  });

  it("rejects a malformed id before it reaches the service", async () => {
    const { eventsService } = buildController();
    const pipe = new ParseUUIDPipe();
    const metadata = { type: "param", data: "id" } as ArgumentMetadata;

    await expect(
      pipe.transform("../../etc/passwd", metadata),
    ).rejects.toThrow();
    expect(eventsService.remove).not.toHaveBeenCalled();
  });

  it("accepts the uuid shape the schema actually generates", async () => {
    const pipe = new ParseUUIDPipe();
    const metadata = { type: "param", data: "id" } as ArgumentMetadata;

    await expect(pipe.transform(EVENT_ID, metadata)).resolves.toBe(EVENT_ID);
  });
});
