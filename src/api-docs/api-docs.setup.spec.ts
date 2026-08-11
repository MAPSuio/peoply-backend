/* @scalar/nestjs-api-reference ships ESM that Jest cannot parse, and none of
   these tests touch the reference UI - only the document route beside it. */
jest.mock("@scalar/nestjs-api-reference", () => ({
  apiReference: () => () => undefined,
}));

import { INestApplication } from "@nestjs/common";
import { OpenAPIObject } from "@nestjs/swagger";
import { setupApiDocs } from "./api-docs.setup";

describe("setupApiDocs — the OpenAPI document route", () => {
  const document = {
    openapi: "3.0.0",
    info: { title: "Peoply API", version: "1" },
    paths: { "/events": {} },
  } as unknown as OpenAPIObject;

  /** Captures the handlers `setupApiDocs` mounts, keyed by path. */
  const mount = () => {
    const handlers = new Map<string, any>();
    const app = {
      use: jest.fn((path: string, handler: any) => {
        handlers.set(path, handler);
      }),
    } as unknown as INestApplication;

    setupApiDocs(app, document);
    return handlers;
  };

  const responseSpy = () => {
    const res: any = {
      type: jest.fn(() => res),
      send: jest.fn(() => res),
      json: jest.fn(() => res),
    };
    return res;
  };

  it("serves the document unchanged", () => {
    const handler = mount().get("/api/openapi.json");
    const res = responseSpy();

    handler({} as any, res);

    expect(JSON.parse(res.send.mock.calls[0][0])).toEqual(document);
    expect(res.type).toHaveBeenCalledWith("application/json");
  });

  /* The point of the change: `res.json(document)` re-serialized 65 routes and
     17 schemas per request, on the one route in the application that no
     throttler covers. Sending a pre-built string is what lets Express set an
     ETag and answer a repeat caller with 304. */
  it("sends a string rather than re-serializing per request", () => {
    const handler = mount().get("/api/openapi.json");
    const res = responseSpy();

    handler({} as any, res);

    expect(typeof res.send.mock.calls[0][0]).toBe("string");
    expect(res.json).not.toHaveBeenCalled();
  });

  it("hands out the identical string on every call", () => {
    const handler = mount().get("/api/openapi.json");
    const first = responseSpy();
    const second = responseSpy();

    handler({} as any, first);
    handler({} as any, second);

    expect(first.send.mock.calls[0][0]).toBe(second.send.mock.calls[0][0]);
  });
});
