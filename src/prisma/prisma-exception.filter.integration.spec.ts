import { Controller, Get, INestApplication, Logger } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { Prisma } from "../generated/prisma/client";
import * as request from "supertest";
import { PrismaExceptionFilter } from "./prisma-exception.filter";

/**
 * The unit spec drives the filter with a mocked http adapter, which cannot
 * show that the filter is wired correctly or that the real Express adapter
 * serialises what it is handed. This boots an actual Nest application and
 * asserts over the wire instead.
 */
/**
 * Read off the installed client rather than hardcoded, so a Prisma upgrade
 * does not leave a stale version string in the fixtures.
 */
const clientVersion = Prisma.prismaVersion.client;

@Controller("probe")
class ProbeController {
  @Get("not-found")
  notFound() {
    throw new Prisma.PrismaClientKnownRequestError(
      "Invalid `prisma.event.delete()` invocation: secret-query-detail",
      { code: "P2025", clientVersion, meta: { modelName: "Event" } },
    );
  }

  @Get("duplicate")
  duplicate() {
    throw new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed: secret-query-detail",
      { code: "P2002", clientVersion, meta: { target: ["urlId"] } },
    );
  }

  @Get("foreign-key")
  foreignKey() {
    throw new Prisma.PrismaClientKnownRequestError(
      "Foreign key constraint failed: secret-query-detail",
      { code: "P2003", clientVersion, meta: { field_name: "categoryId" } },
    );
  }

  @Get("unmapped")
  unmapped() {
    throw new Prisma.PrismaClientKnownRequestError(
      "Something else entirely: secret-query-detail",
      { code: "P2037", clientVersion },
    );
  }
}

describe("PrismaExceptionFilter (over HTTP)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);

    const moduleRef = await Test.createTestingModule({
      controllers: [ProbeController],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new PrismaExceptionFilter(app.get(HttpAdapterHost)));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("answers 404 and names the model", async () => {
    const res = await request(app.getHttpServer()).get("/probe/not-found");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      statusCode: 404,
      message: "Event not found",
      error: "Not Found",
    });
  });

  it("answers 409 and names the duplicated field", async () => {
    const res = await request(app.getHttpServer()).get("/probe/duplicate");

    expect(res.status).toBe(409);
    expect(res.body.message).toBe("A record with this urlId already exists");
  });

  it("answers 400 on a failed foreign key", async () => {
    const res = await request(app.getHttpServer()).get("/probe/foreign-key");

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Invalid reference in categoryId");
  });

  it("answers 500 without describing an unmapped code", async () => {
    const res = await request(app.getHttpServer()).get("/probe/unmapped");

    expect(res.status).toBe(500);
    expect(res.body.message).toBe("Internal server error");
  });

  // The whole point of the filter: Prisma's message carries query text and
  // column values, and none of it may reach a client.
  it.each(["not-found", "duplicate", "foreign-key", "unmapped"])(
    "never puts the raw Prisma message in the /%s response",
    async (route) => {
      const res = await request(app.getHttpServer()).get(`/probe/${route}`);

      expect(res.text).not.toContain("secret-query-detail");
      expect(res.text).not.toContain("prisma.event.delete");
    },
  );
});
