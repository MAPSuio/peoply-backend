import { CfThrottlerGuard } from "./cf-throttler.guard";

describe("CfThrottlerGuard", () => {
  // Access protected method via cast
  const getTracker = (req: unknown) => (guard as any).getTracker(req);

  let guard: CfThrottlerGuard;
  const originalSecret = process.env.CLOUDFLARE_ORIGIN_SECRET;

  beforeEach(() => {
    guard = new CfThrottlerGuard(null as any, null as any, null as any);
    delete process.env.CLOUDFLARE_ORIGIN_SECRET;
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.CLOUDFLARE_ORIGIN_SECRET;
    } else {
      process.env.CLOUDFLARE_ORIGIN_SECRET = originalSecret;
    }
  });

  it("returns CF-Connecting-IP when present as string", async () => {
    const req = { headers: { "cf-connecting-ip": "1.2.3.4" }, ip: "10.0.0.1" };
    await expect(getTracker(req)).resolves.toBe("1.2.3.4");
  });

  it("returns first element when CF-Connecting-IP is an array", async () => {
    const req = {
      headers: { "cf-connecting-ip": ["1.2.3.4", "5.6.7.8"] },
      ip: "10.0.0.1",
    };
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

  it("ignores a CF-Connecting-IP that is not an address", async () => {
    const req = {
      headers: { "cf-connecting-ip": "not-an-ip" },
      ip: "10.0.0.1",
    };
    await expect(getTracker(req)).resolves.toBe("10.0.0.1");
  });

  // A forged header must not buy a fresh bucket once the origin can tell
  // Cloudflare traffic apart from traffic sent straight to it.
  it("ignores CF-Connecting-IP without the origin secret when one is configured", async () => {
    process.env.CLOUDFLARE_ORIGIN_SECRET = "s3cret";
    const req = { headers: { "cf-connecting-ip": "1.2.3.4" }, ip: "10.0.0.1" };
    await expect(getTracker(req)).resolves.toBe("10.0.0.1");
  });

  it("honours CF-Connecting-IP when the origin secret matches", async () => {
    process.env.CLOUDFLARE_ORIGIN_SECRET = "s3cret";
    const req = {
      headers: {
        "cf-connecting-ip": "1.2.3.4",
        "x-cf-origin-secret": "s3cret",
      },
      ip: "10.0.0.1",
    };
    await expect(getTracker(req)).resolves.toBe("1.2.3.4");
  });
});
