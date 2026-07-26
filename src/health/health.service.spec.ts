import { Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { HealthService } from "./health.service";

/** Mirrors the constants in health.service.ts. */
const DATABASE_TIMEOUT_MS = 2000;
const CACHE_TTL_MS = 2000;

describe("HealthService", () => {
  let queryRaw: jest.Mock;
  let logError: jest.SpyInstance;
  let service: HealthService;

  beforeEach(() => {
    jest.useFakeTimers();
    logError = jest
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);
    queryRaw = jest.fn().mockResolvedValue([{ "?column?": 1 }]);
    service = new HealthService({
      $queryRaw: queryRaw,
    } as unknown as PrismaService);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("reports ready when the database answers", async () => {
    await expect(service.check()).resolves.toEqual({
      ready: true,
      checks: { database: "up" },
    });
  });

  it("reports not ready when the database refuses the query", async () => {
    queryRaw.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(service.check()).resolves.toEqual({
      ready: false,
      checks: { database: "down" },
    });
  });

  // The failure that started all this did not refuse the connection, it hung.
  // Without a timeout the probe would wait as long as the driver does, and the
  // platform would kill the request before we ever answered.
  it("reports not ready when the database never answers", async () => {
    queryRaw.mockReturnValue(new Promise(() => undefined));

    const pending = service.check();
    await jest.advanceTimersByTimeAsync(DATABASE_TIMEOUT_MS);

    await expect(pending).resolves.toEqual({
      ready: false,
      checks: { database: "down" },
    });
  });

  it("keeps the driver's error out of the response and in the log", async () => {
    queryRaw.mockRejectedValue(
      new Error("connect ECONNREFUSED db-postgresql-fra1-12345.b.db.example"),
    );

    const result = await service.check();

    expect(JSON.stringify(result)).not.toContain("db.example");
    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining("db-postgresql-fra1-12345"),
    );
  });

  it("serves repeat calls from cache instead of the database", async () => {
    await service.check();
    await service.check();

    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it("probes again once the cache expires", async () => {
    await service.check();
    await jest.advanceTimersByTimeAsync(CACHE_TTL_MS);
    await service.check();

    expect(queryRaw).toHaveBeenCalledTimes(2);
  });

  // A cold cache plus a burst of requests is exactly when the database can
  // least afford one query per caller.
  it("collapses concurrent calls into a single probe", async () => {
    let answer: (rows: unknown[]) => void = () => undefined;
    queryRaw.mockReturnValue(
      new Promise<unknown[]>((resolve) => {
        answer = resolve;
      }),
    );

    const calls = [service.check(), service.check(), service.check()];
    answer([{ "?column?": 1 }]);
    await Promise.all(calls);

    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it("caches a failure so a down database is not hammered", async () => {
    queryRaw.mockRejectedValue(new Error("ECONNREFUSED"));

    await service.check();
    await service.check();

    expect(queryRaw).toHaveBeenCalledTimes(1);
  });
});
