import { CfThrottlerGuard } from "./cf-throttler.guard";

describe("CfThrottlerGuard", () => {
  // Access protected method via cast
  const getTracker = (req: unknown) =>
    (guard as any).getTracker(req);

  let guard: CfThrottlerGuard;

  beforeEach(() => {
    guard = new CfThrottlerGuard(null as any, null as any, null as any);
  });

  it("returns CF-Connecting-IP when present as string", async () => {
    const req = { headers: { "cf-connecting-ip": "1.2.3.4" }, ip: "10.0.0.1" };
    await expect(getTracker(req)).resolves.toBe("1.2.3.4");
  });

  it("returns first element when CF-Connecting-IP is an array", async () => {
    const req = { headers: { "cf-connecting-ip": ["1.2.3.4", "5.6.7.8"] }, ip: "10.0.0.1" };
    await expect(getTracker(req)).resolves.toBe("1.2.3.4");
  });

  it("falls back to req.ip when CF-Connecting-IP is absent", async () => {
    const req = { headers: {}, ip: "10.0.0.1" };
    await expect(getTracker(req)).resolves.toBe("10.0.0.1");
  });

  it("returns 'unknown' when both CF-Connecting-IP and req.ip are absent", async () => {
    const req = { headers: {}, ip: undefined };
    await expect(getTracker(req)).resolves.toBe("unknown");
  });
});
