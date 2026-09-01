import { INestApplication, UnauthorizedException } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { ThrottlerModule } from "@nestjs/throttler";
import request = require("supertest");
import { IS_PUBLIC_ROUTE } from "../auth/public.decorator";
import { AccessSessionService } from "../auth/access-session.service";
import { SessionRequiredGuard } from "../auth/guards/session-required.guard";
import { CfThrottlerGuard } from "../cf-throttler.guard";
import { McpApiKeyService } from "./mcp-api-key.service";
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
      controllers: [McpToolsController, McpKeysController],
      providers: [
        {
          provide: McpServerFactory,
          useValue: { describeTools: () => catalogue },
        },
        { provide: APP_GUARD, useClass: CfThrottlerGuard },
        { provide: APP_GUARD, useClass: SessionRequiredGuard },
        {
          provide: AccessSessionService,
          useValue: {
            userFromRequest: async () => {
              throw new UnauthorizedException();
            },
          },
        },
        { provide: McpApiKeyService, useValue: { list: async () => [] } },
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

  it("stays open while the key endpoints beside it demand a session", async () => {
    await request(app.getHttpServer()).get("/mcp/tools").expect(200);
    await request(app.getHttpServer()).get("/mcp/keys").expect(401);

    expect(
      Reflect.getMetadata(IS_PUBLIC_ROUTE, McpToolsController.prototype.list),
    ).toBe(true);
    expect(
      Reflect.getMetadata(IS_PUBLIC_ROUTE, McpKeysController.prototype.list),
    ).toBeUndefined();
  });
});
