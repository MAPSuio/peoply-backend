import { PrismaService } from "../../../prisma.service";
import { Test, TestingModule } from "@nestjs/testing";
import { EventsService } from "../../events.service";
import { prismaMock } from "../../../prismaTestFiles/prismaTestSingleton";
// import { createTestEvent } from "./prismaTestFunctions";

describe("EventsService", () => {
  let service: EventsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EventsService, PrismaService],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    service = module.get<EventsService>(EventsService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });
  it("It should pass since the ID matches", async () => {
    const passingTestEvent = {
      event_id: 1,
      start_date: new Date(),
      end_date: new Date(),
      title: "Gangbang",
      description: "bring lube",
      capacity: 150,
      private: false,
    };
    prismaMock.events.create.mockResolvedValue(passingTestEvent);

    await expect(service.create(passingTestEvent)).resolves.toMatchObject({
      event_id: 1,
    });
  });
});
