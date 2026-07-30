import { resolveClientIp, isOriginSecretConfigured } from "./client-ip";

const ORIGINAL_SECRET = process.env.CLOUDFLARE_ORIGIN_SECRET;

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) {
    delete process.env.CLOUDFLARE_ORIGIN_SECRET;
  } else {
    process.env.CLOUDFLARE_ORIGIN_SECRET = ORIGINAL_SECRET;
  }
});

describe("resolveClientIp", () => {
  describe("without CLOUDFLARE_ORIGIN_SECRET", () => {
    beforeEach(() => {
      delete process.env.CLOUDFLARE_ORIGIN_SECRET;
    });

    it("uses CF-Connecting-IP when it is a valid address", () => {
      expect(
        resolveClientIp({
          headers: { "cf-connecting-ip": "1.2.3.4" },
          ip: "10.0.0.1",
        }),
      ).toBe("1.2.3.4");
    });

    it("uses the first value when CF-Connecting-IP repeats", () => {
      expect(
        resolveClientIp({
          headers: { "cf-connecting-ip": ["1.2.3.4", "5.6.7.8"] },
          ip: "10.0.0.1",
        }),
      ).toBe("1.2.3.4");
    });

    it("accepts IPv6", () => {
      expect(
        resolveClientIp({
          headers: { "cf-connecting-ip": "2001:db8::1" },
          ip: "10.0.0.1",
        }),
      ).toBe("2001:db8::1");
    });

    it("falls back to req.ip when CF-Connecting-IP is absent", () => {
      expect(resolveClientIp({ headers: {}, ip: "10.0.0.1" })).toBe("10.0.0.1");
    });

    it("returns 'unknown' when neither is available", () => {
      expect(resolveClientIp({ headers: {}, ip: undefined })).toBe("unknown");
    });

    // The header is a Map key in the throttler and in threat detection, and is
    // interpolated into log lines and Discord alerts. Anything that is not an
    // address has no business being any of those.
    it.each([
      ["not-an-ip", "an arbitrary string"],
      ["", "an empty value"],
      ["1.2.3.4, 5.6.7.8", "a comma-joined list"],
      ["a".repeat(5000), "an oversized value"],
      ["@everyone", "a Discord mention"],
    ])("ignores %s (%s) and falls back to req.ip", (value) => {
      expect(
        resolveClientIp({
          headers: { "cf-connecting-ip": value },
          ip: "10.0.0.1",
        }),
      ).toBe("10.0.0.1");
    });
  });

  describe("with CLOUDFLARE_ORIGIN_SECRET", () => {
    beforeEach(() => {
      process.env.CLOUDFLARE_ORIGIN_SECRET = "s3cret";
    });

    it("trusts CF-Connecting-IP when the shared secret matches", () => {
      expect(
        resolveClientIp({
          headers: {
            "cf-connecting-ip": "1.2.3.4",
            "x-cf-origin-secret": "s3cret",
          },
          ip: "10.0.0.1",
        }),
      ).toBe("1.2.3.4");
    });

    // The whole point: a request straight to the *.ondigitalocean.app origin
    // cannot pick its own throttler bucket.
    it("ignores CF-Connecting-IP when the secret is missing", () => {
      expect(
        resolveClientIp({
          headers: { "cf-connecting-ip": "1.2.3.4" },
          ip: "10.0.0.1",
        }),
      ).toBe("10.0.0.1");
    });

    it("ignores CF-Connecting-IP when the secret is wrong", () => {
      expect(
        resolveClientIp({
          headers: {
            "cf-connecting-ip": "1.2.3.4",
            "x-cf-origin-secret": "wrong",
          },
          ip: "10.0.0.1",
        }),
      ).toBe("10.0.0.1");
    });

    it("ignores a secret of a different length without throwing", () => {
      expect(() =>
        resolveClientIp({
          headers: {
            "cf-connecting-ip": "1.2.3.4",
            "x-cf-origin-secret": "much-longer-than-the-real-one",
          },
          ip: "10.0.0.1",
        }),
      ).not.toThrow();
    });

    it("rotating the header no longer yields a fresh bucket", () => {
      const buckets = new Set(
        ["1.1.1.1", "2.2.2.2", "3.3.3.3"].map((forged) =>
          resolveClientIp({
            headers: { "cf-connecting-ip": forged },
            ip: "10.0.0.1",
          }),
        ),
      );

      expect([...buckets]).toEqual(["10.0.0.1"]);
    });
  });
});

describe("isOriginSecretConfigured", () => {
  it("is false when the variable is unset", () => {
    delete process.env.CLOUDFLARE_ORIGIN_SECRET;
    expect(isOriginSecretConfigured()).toBe(false);
  });

  it("is true when the variable is set", () => {
    process.env.CLOUDFLARE_ORIGIN_SECRET = "s3cret";
    expect(isOriginSecretConfigured()).toBe(true);
  });
});
