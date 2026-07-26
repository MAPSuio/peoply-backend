import { Response } from "express";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";

describe("HealthController", () => {
  const response = () => ({ status: jest.fn() }) as unknown as Response;

  it("answers liveness without consulting any dependency", () => {
    const check = jest.fn();
    const controller = new HealthController({
      check,
    } as unknown as HealthService);

    expect(controller.liveness()).toEqual({ status: "ok" });
    expect(check).not.toHaveBeenCalled();
  });

  it("answers readiness with 200 when the database is up", async () => {
    const res = response();
    const controller = new HealthController({
      check: jest
        .fn()
        .mockResolvedValue({ ready: true, checks: { database: "up" } }),
    } as unknown as HealthService);

    await expect(controller.readiness(res)).resolves.toEqual({
      status: "ready",
      checks: { database: "up" },
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // The status code is the part the platform reads. A body saying "not_ready"
  // under an HTTP 200 would keep a broken instance in the load balancer.
  it("answers readiness with 503 when the database is down", async () => {
    const res = response();
    const controller = new HealthController({
      check: jest
        .fn()
        .mockResolvedValue({ ready: false, checks: { database: "down" } }),
    } as unknown as HealthService);

    await expect(controller.readiness(res)).resolves.toEqual({
      status: "not_ready",
      checks: { database: "down" },
    });
    expect(res.status).toHaveBeenCalledWith(503);
  });
});
