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

    // The header is a Map key in the throttler and is
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

describe("resolveClientIp across the forwarding chain", () => {
  const OUR_CLOUDFLARE_EDGE = "162.158.0.1";
  const DIGITALOCEAN_CLOUDFLARE_EDGE = "172.64.0.1";
  const PLATFORM_HOP = "10.244.0.7";
  const VISITOR = "84.211.24.137";

  beforeEach(() => {
    process.env.CLOUDFLARE_ORIGIN_SECRET = "s3cret";
  });

  function requestThroughCloudflare(forwardedFor: string) {
    return {
      headers: {
        "x-forwarded-for": forwardedFor,
        "x-cf-origin-secret": "s3cret",
        "cf-connecting-ip": OUR_CLOUDFLARE_EDGE,
      },
      socket: { remoteAddress: PLATFORM_HOP },
      ip: OUR_CLOUDFLARE_EDGE,
    };
  }

  it("reports the visitor rather than the edge that relayed them", () => {
    expect(
      resolveClientIp(
        requestThroughCloudflare(
          `${VISITOR}, ${OUR_CLOUDFLARE_EDGE}, ${DIGITALOCEAN_CLOUDFLARE_EDGE}`,
        ),
      ),
    ).toBe(VISITOR);
  });

  it("puts two visitors behind one edge in different buckets", () => {
    const other = "84.211.24.200";

    expect(
      resolveClientIp(
        requestThroughCloudflare(`${VISITOR}, ${OUR_CLOUDFLARE_EDGE}`),
      ),
    ).not.toBe(
      resolveClientIp(
        requestThroughCloudflare(`${other}, ${OUR_CLOUDFLARE_EDGE}`),
      ),
    );
  });

  it("keeps one visitor in one bucket however the edge rotates", () => {
    const buckets = new Set(
      ["162.158.0.1", "162.158.9.9", "104.16.0.5"].map((edge) =>
        resolveClientIp(requestThroughCloudflare(`${VISITOR}, ${edge}`)),
      ),
    );

    expect([...buckets]).toEqual([VISITOR]);
  });

  it("ignores entries the caller prepended to the chain", () => {
    expect(
      resolveClientIp(requestThroughCloudflare(`1.1.1.1, 2.2.2.2, ${VISITOR}`)),
    ).toBe(VISITOR);
  });

  it("gives a caller who reaches the origin directly no say in their bucket", () => {
    const buckets = new Set(
      ["1.1.1.1", "2.2.2.2", "3.3.3.3"].map((forged) =>
        resolveClientIp({
          headers: { "x-forwarded-for": `${forged}, ${VISITOR}` },
          socket: { remoteAddress: PLATFORM_HOP },
          ip: forged,
        }),
      ),
    );

    expect([...buckets]).toEqual([VISITOR]);
  });

  it("does not skip past a Cloudflare address when Cloudflare is unproven", () => {
    expect(
      resolveClientIp({
        headers: { "x-forwarded-for": `${VISITOR}, ${OUR_CLOUDFLARE_EDGE}` },
        socket: { remoteAddress: PLATFORM_HOP },
        ip: VISITOR,
      }),
    ).toBe(OUR_CLOUDFLARE_EDGE);
  });

  it("normalises the IPv4-mapped socket address into one bucket", () => {
    expect(
      resolveClientIp({
        headers: {},
        socket: { remoteAddress: `::ffff:${VISITOR}` },
      }),
    ).toBe(VISITOR);
  });

  it("skips chain entries that are not addresses", () => {
    expect(
      resolveClientIp(
        requestThroughCloudflare(
          `${VISITOR}, not-an-ip, ${OUR_CLOUDFLARE_EDGE}`,
        ),
      ),
    ).toBe(VISITOR);
  });

  it("falls back to the outermost hop when every entry is infrastructure", () => {
    expect(
      resolveClientIp({
        headers: {
          "x-forwarded-for": `${OUR_CLOUDFLARE_EDGE}`,
          "x-cf-origin-secret": "s3cret",
        },
        socket: { remoteAddress: PLATFORM_HOP },
      }),
    ).toBe(OUR_CLOUDFLARE_EDGE);
  });
});
