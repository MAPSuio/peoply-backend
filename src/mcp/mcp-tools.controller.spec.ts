import { Test } from "@nestjs/testing";
import { McpServerFactory } from "./mcp-server.factory";
import { McpToolsController } from "./mcp-tools.controller";

describe("McpToolsController", () => {
  const describeTools = jest.fn();

  async function createController() {
    const moduleRef = await Test.createTestingModule({
      controllers: [McpToolsController],
      providers: [{ provide: McpServerFactory, useValue: { describeTools } }],
    }).compile();

    return moduleRef.get(McpToolsController);
  }

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("lists the tool catalogue without requiring a key", async () => {
    const summaries = [
      {
        name: "search_events",
        title: "Search public events",
        description: "Search public Peoply events.",
        scope: "peoply:read",
      },
    ];
    describeTools.mockReturnValue(summaries);
    const controller = await createController();

    expect(controller.list()).toEqual(summaries);
  });
});
