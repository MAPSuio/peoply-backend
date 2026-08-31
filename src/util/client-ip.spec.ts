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

    it("ignores CF-Connecting-IP, which nothing can vouch for", () => {
      expect(
        resolveClientIp({
          headers: { "cf-connecting-ip": "1.2.3.4" },
          ip: "10.0.0.1",
        }),
      ).toBe("10.0.0.1");
    });

    it("gives a caller who rotates the header the same bucket every time", () => {
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

    it("still reads the visitor out of the forwarding chain", () => {
      expect(
        resolveClientIp({
          headers: { "x-forwarded-for": "84.211.24.137, 162.158.0.1" },
          socket: { remoteAddress: "10.244.0.7" },
        }),
      ).toBe("84.211.24.137");
    });

    it("falls back to req.ip when there is nothing else", () => {
      expect(resolveClientIp({ headers: {}, ip: "10.0.0.1" })).toBe("10.0.0.1");
    });

    it("returns 'unknown' when there is nothing at all", () => {
      expect(resolveClientIp({ headers: {}, ip: undefined })).toBe("unknown");
    });
  });

  describe("with CLOUDFLARE_ORIGIN_SECRET", () => {
    beforeEach(() => {
      process.env.CLOUDFLARE_ORIGIN_SECRET = "s3cret";
    });

    it("takes the address our own zone stamped on the request", () => {
      expect(
        resolveClientIp({
          headers: {
            "x-peoply-client-ip": "84.211.24.137",
            "x-cf-origin-secret": "s3cret",
            "x-forwarded-for": "1.1.1.1, 104.16.5.5, 162.158.0.1",
          },
          socket: { remoteAddress: "10.244.0.7" },
        }),
      ).toBe("84.211.24.137");
    });

    it("ignores a stamped address from a caller who cannot prove the zone", () => {
      expect(
        resolveClientIp({
          headers: { "x-peoply-client-ip": "1.2.3.4" },
          socket: { remoteAddress: "10.244.0.7" },
          ip: "10.244.0.7",
        }),
      ).toBe("10.244.0.7");
    });

    it("ignores a stamped value that is not an address", () => {
      expect(
        resolveClientIp({
          headers: {
            "x-peoply-client-ip": "not-an-ip",
            "x-cf-origin-secret": "s3cret",
            "x-forwarded-for": "84.211.24.137, 162.158.0.1",
          },
          socket: { remoteAddress: "10.244.0.7" },
        }),
      ).toBe("84.211.24.137");
    });

    it("falls back to CF-Connecting-IP when the zone stamped nothing", () => {
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

    it("survives whitespace the hosting console adds to a pasted secret", () => {
      process.env.CLOUDFLARE_ORIGIN_SECRET = "s3cret\n";

      expect(
        resolveClientIp({
          headers: {
            "x-peoply-client-ip": "84.211.24.137",
            "x-cf-origin-secret": "s3cret",
          },
          socket: { remoteAddress: "10.244.0.7" },
        }),
      ).toBe("84.211.24.137");
    });

    it.each([
      ["not-an-ip", "an arbitrary string"],
      ["", "an empty value"],
      ["1.2.3.4, 5.6.7.8", "a comma-joined list"],
      ["a".repeat(5000), "an oversized value"],
      ["@everyone", "a Discord mention"],
    ])("ignores %s (%s) in CF-Connecting-IP", (value) => {
      expect(
        resolveClientIp({
          headers: {
            "cf-connecting-ip": value,
            "x-cf-origin-secret": "s3cret",
          },
          ip: "10.0.0.1",
        }),
      ).toBe("10.0.0.1");
    });
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

  it("gives a caller relaying through Cloudflare no say once the zone stamps the address", () => {
    const buckets = new Set(
      ["1.1.1.1", "2.2.2.2", "3.3.3.3"].map((forged) =>
        resolveClientIp({
          headers: {
            "x-peoply-client-ip": "104.16.5.5",
            "x-cf-origin-secret": "s3cret",
            "x-forwarded-for": `${forged}, 104.16.5.5, ${OUR_CLOUDFLARE_EDGE}`,
          },
          socket: { remoteAddress: PLATFORM_HOP },
        }),
      ),
    );

    expect([...buckets]).toEqual(["104.16.5.5"]);
  });

  it("inspects a bounded number of hops however long the header is", () => {
    const flood = Array.from({ length: 4000 }, () => "1.1.1.1").join(", ");

    expect(
      resolveClientIp(
        requestThroughCloudflare(
          `${flood}, ${VISITOR}, ${OUR_CLOUDFLARE_EDGE}`,
        ),
      ),
    ).toBe(VISITOR);
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

describe("isOriginSecretConfigured", () => {
  it("is false when the variable is unset", () => {
    delete process.env.CLOUDFLARE_ORIGIN_SECRET;
    expect(isOriginSecretConfigured()).toBe(false);
  });

  it("is false when the variable holds only whitespace", () => {
    process.env.CLOUDFLARE_ORIGIN_SECRET = "  ";
    expect(isOriginSecretConfigured()).toBe(false);
  });

  it("is true when the variable is set", () => {
    process.env.CLOUDFLARE_ORIGIN_SECRET = "s3cret";
    expect(isOriginSecretConfigured()).toBe(true);
  });
});
