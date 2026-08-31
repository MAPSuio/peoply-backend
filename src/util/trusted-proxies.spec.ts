import { isTrustedProxy, normalizeIp } from "./trusted-proxies";

describe("normalizeIp", () => {
  it("unwraps the IPv4-mapped form Node reports for IPv4 sockets", () => {
    expect(normalizeIp("::ffff:84.211.24.137")).toBe("84.211.24.137");
  });

  it("leaves a real IPv6 address alone", () => {
    expect(normalizeIp(" 2001:db8::1 ")).toBe("2001:db8::1");
  });
});

describe("isTrustedProxy", () => {
  it.each(["127.0.0.1", "10.4.5.6", "172.16.0.9", "192.168.1.1", "::1"])(
    "treats the platform address %s as a hop, never as a visitor",
    (address) => {
      expect(isTrustedProxy(address, false)).toBe(true);
    },
  );

  it("treats a Cloudflare edge address as a hop only when Cloudflare is trusted", () => {
    expect(isTrustedProxy("162.158.0.1", true)).toBe(true);
    expect(isTrustedProxy("162.158.0.1", false)).toBe(false);
  });

  it("treats an ordinary public address as a visitor", () => {
    expect(isTrustedProxy("84.211.24.137", true)).toBe(false);
    expect(isTrustedProxy("2001:db8::1", true)).toBe(false);
  });

  it("treats an unparseable value as a visitor rather than skipping past it", () => {
    expect(isTrustedProxy("not-an-ip", true)).toBe(false);
  });

  it("recognises the IPv4-mapped form of a platform address", () => {
    expect(isTrustedProxy("::ffff:10.4.5.6", false)).toBe(true);
  });

  it("recognises an IPv6 Cloudflare edge address as a hop only when Cloudflare is trusted", () => {
    expect(isTrustedProxy("2606:4700::1", true)).toBe(true);
    expect(isTrustedProxy("2606:4700::1", false)).toBe(false);
  });

  it("recognises an IPv6 platform address as a hop", () => {
    expect(isTrustedProxy("fc00::1", false)).toBe(true);
  });
});
