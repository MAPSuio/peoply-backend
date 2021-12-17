import { Test, TestingModule } from "@nestjs/testing";
import { EventsController } from "./events.controller";
import { EventsService } from "./events.service";

describe("EventsController", () => {
  let controller: EventsController;

  /* Declare an object to be used instead of a provider.
     This object can contain mocks of methods used in the
     actual provider, such as the create function. 
     The number and type of arguments need to mirror original.
  */
  const mockEventsService: object = {
    create: jest.fn((dto) => {
      return {
        event_id: 1,
        ...dto,
        //if changing existing fields - implement after spread
      };
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [EventsService],
    })
      .overrideProvider(EventsService) //override eventsService with mock object
      .useValue(mockEventsService)
      .compile();

    controller = module.get<EventsController>(EventsController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  /* We need to provide all properties required in the dto.
     Fields set in the DB can be set in the mock-create. 
     Alternatively we can change fields with existing 
     values in the mock-create.
  */
  it("should create an event", async () => {
    const newEvent = await controller.create({
      title: "Gangbang",
      description: "bring lube",
      start_date: new Date(),
      end_date: new Date(),
      capacity: 150,
      private: false,
    });

    expect(newEvent).toMatchObject({
      event_id: expect.any(Number),
    });
  });
});
