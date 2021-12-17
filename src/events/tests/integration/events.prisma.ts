import { PrismaClientKnownRequestError } from "@prisma/client/runtime";
import { PrismaService as prisma } from "../../../prisma.service";
import { Test, TestingModule } from "@nestjs/testing";
import { EventsService } from "../../events.service";
import { failingIdUniqueTestDTO, passingTestDTO } from "./prismaTestObjects";

describe("EventsService", () => {
  let service: EventsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EventsService, prisma],
    }).compile();

    service = module.get<EventsService>(EventsService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });
  it("It should pass since all fields are correct", async () => {
    await expect(service.create(passingTestDTO)).resolves.toMatchObject({
      event_id: expect.any(Number),
    });
  });
  it("should fail because it tries to provide an existing event id", async () => {
    await expect(service.create(failingIdUniqueTestDTO)).rejects.toThrowError(
      PrismaClientKnownRequestError,
    );
  });
});
