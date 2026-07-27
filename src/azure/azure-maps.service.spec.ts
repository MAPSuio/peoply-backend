import { AzureMapsService } from "./azure-maps.service";

/** Mirrors the constant in azure-maps.service.ts. */
const AZURE_MAPS_TIMEOUT_MS = 15_000;

describe("AzureMapsService", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("creates a fresh timeout aborter for each request", async () => {
    const service = new AzureMapsService({
      getOrThrow: jest.fn().mockReturnValue("fake-maps-key"),
    } as any);
    const first = service.aborter;
    const second = service.aborter;

    expect(first).not.toBe(second);
    expect(first.aborted).toBe(false);
    expect(second.aborted).toBe(false);

    await jest.advanceTimersByTimeAsync(AZURE_MAPS_TIMEOUT_MS);

    expect(first.aborted).toBe(true);
    expect(second.aborted).toBe(true);

    const third = service.aborter;

    expect(third.aborted).toBe(false);
  });
});
