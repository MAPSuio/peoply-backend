import { INestApplication } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { ThrottlerModule } from "@nestjs/throttler";
import request = require("supertest");
import { AuthenticatedGuard } from "../auth/guards";
import { CfThrottlerGuard } from "../cf-throttler.guard";
import { McpKeysController } from "./mcp-keys.controller";
import { McpServerFactory } from "./mcp-server.factory";
import { McpToolsController } from "./mcp-tools.controller";

const catalogue = [
  {
    name: "search_events",
    title: "Search public events",
    description: "Search public Peoply events.",
    scope: "peoply:read",
  },
];

describe("GET /mcp/tools without credentials", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([{ name: "default", ttl: 60000, limit: 100 }]),
      ],
      controllers: [McpToolsController],
      providers: [
        {
          provide: McpServerFactory,
          useValue: { describeTools: () => catalogue },
        },
        { provide: APP_GUARD, useClass: CfThrottlerGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("serves the catalogue to anonymous callers", async () => {
    const response = await request(app.getHttpServer())
      .get("/mcp/tools")
      .expect(200);

    expect(response.body).toEqual(catalogue);
  });

  it("does not leak a Set-Cookie or authenticate the caller", async () => {
    const response = await request(app.getHttpServer()).get("/mcp/tools");

    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("stays deliberately unguarded, unlike the key endpoints", () => {
    expect(
      Reflect.getMetadata("__guards__", McpToolsController),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata("__guards__", McpToolsController.prototype.list),
    ).toBeUndefined();
    expect(Reflect.getMetadata("__guards__", McpKeysController)).toEqual([
      AuthenticatedGuard,
    ]);
  });
});
