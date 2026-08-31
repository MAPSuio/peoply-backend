import { Controller, Get, INestApplication } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { ThrottlerModule } from "@nestjs/throttler";
import request = require("supertest");
import { CfThrottlerGuard } from "./cf-throttler.guard";
import {
  PER_ROUTE_THROTTLER,
  SkipRateLimit,
  WHOLE_APP_THROTTLER,
} from "./rate-limit";

const PER_ROUTE_LIMIT = 3;
const WHOLE_APP_LIMIT = 5;
const VISITOR = "84.211.24.137";
const OTHER_VISITOR = "84.211.24.200";
const CLOUDFLARE_EDGE = "162.158.0.1";

@Controller()
class ProbeController {
  @Get("first")
  first() {
    return "first";
  }

  @Get("second")
  second() {
    return "second";
  }

  @Get("third")
  third() {
    return "third";
  }

  @Get("fourth")
  fourth() {
    return "fourth";
  }

  @Get("fifth")
  fifth() {
    return "fifth";
  }

  @Get("sixth")
  sixth() {
    return "sixth";
  }

  @SkipRateLimit()
  @Get("health")
  health() {
    return "health";
  }
}

async function statusesFor(
  app: INestApplication,
  paths: string[],
  visitor: string,
) {
  const statuses: number[] = [];

  for (const path of paths) {
    const response = await request(app.getHttpServer())
      .get(`/${path}`)
      .set("X-Forwarded-For", `${visitor}, ${CLOUDFLARE_EDGE}`);
    statuses.push(response.status);
  }

  return statuses;
}

describe("CfThrottlerGuard over HTTP", () => {
  let app: INestApplication;
  const originalSecret = process.env.CLOUDFLARE_ORIGIN_SECRET;

  beforeEach(async () => {
    delete process.env.CLOUDFLARE_ORIGIN_SECRET;

    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([
          { name: PER_ROUTE_THROTTLER, ttl: 60000, limit: PER_ROUTE_LIMIT },
          { name: WHOLE_APP_THROTTLER, ttl: 60000, limit: WHOLE_APP_LIMIT },
        ]),
      ],
      controllers: [ProbeController],
      providers: [{ provide: APP_GUARD, useClass: CfThrottlerGuard }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();

    if (originalSecret === undefined) {
      delete process.env.CLOUDFLARE_ORIGIN_SECRET;
    } else {
      process.env.CLOUDFLARE_ORIGIN_SECRET = originalSecret;
    }
  });

  it("stops a caller who spreads the same load across different routes", async () => {
    const statuses = await statusesFor(
      app,
      ["first", "second", "third", "fourth", "fifth", "sixth"],
      VISITOR,
    );

    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
  });

  it("stops a caller hammering one route before the shared allowance runs out", async () => {
    const statuses = await statusesFor(
      app,
      ["first", "first", "first", "first"],
      VISITOR,
    );

    expect(statuses).toEqual([200, 200, 200, 429]);
  });

  it("does not spend one visitor's allowance on another behind the same edge", async () => {
    await statusesFor(
      app,
      ["first", "second", "third", "fourth", "fifth"],
      VISITOR,
    );

    expect(await statusesFor(app, ["first"], OTHER_VISITOR)).toEqual([200]);
  });

  it("leaves the platform health probe outside both allowances", async () => {
    await statusesFor(
      app,
      ["first", "second", "third", "fourth", "fifth", "sixth"],
      VISITOR,
    );

    expect(await statusesFor(app, ["health", "health"], VISITOR)).toEqual([
      200, 200,
    ]);
  });
});
