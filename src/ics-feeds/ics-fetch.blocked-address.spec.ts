import { isBlockedAddress } from "./ics-fetch.service";

describe("isBlockedAddress", () => {
  // Every one of these passed the previous prefix-matching implementation.
  // They are the reason it was replaced.
  describe("addresses the old prefix matching let through", () => {
    it.each([
      ["127.0.0.2", "loopback other than .1"],
      ["127.1.1.1", "elsewhere in 127.0.0.0/8"],
      ["0.0.0.1", "0.0.0.0/8 rather than exactly 0.0.0.0"],
      ["100.64.1.1", "CGNAT, never covered at all"],
      ["::ffff:169.254.169.254", "cloud metadata, IPv4-mapped"],
      ["::ffff:10.0.0.5", "RFC1918, IPv4-mapped"],
      ["::ffff:192.168.1.1", "RFC1918, IPv4-mapped"],
      ["::ffff:7f00:1", "loopback, IPv4-mapped in hex form"],
      ["fe90::1", "fe80::/10 beyond the literal fe80: prefix"],
      ["FE80::1", "link-local in uppercase"],
      ["::", "the unspecified address"],
      ["::127.0.0.1", "loopback, IPv4-compatible form"],
    ])("blocks %s (%s)", (address) => {
      expect(isBlockedAddress(address)).toBe(true);
    });
  });

  describe("ranges that were already blocked stay blocked", () => {
    it.each([
      "127.0.0.1",
      "0.0.0.0",
      "::1",
      "10.0.0.1",
      "192.168.1.1",
      "172.16.0.1",
      "172.31.255.255",
      "169.254.169.254",
      "fc00::1",
      "fd12:3456::1",
      "fe80::1",
    ])("blocks %s", (address) => {
      expect(isBlockedAddress(address)).toBe(true);
    });
  });

  describe("other non-routable ranges", () => {
    it.each([
      ["224.0.0.1", "multicast"],
      ["239.255.255.250", "multicast"],
      ["240.0.0.1", "reserved"],
      ["255.255.255.255", "broadcast"],
      ["192.0.2.1", "TEST-NET-1"],
      ["ff02::1", "IPv6 multicast"],
    ])("blocks %s (%s)", (address) => {
      expect(isBlockedAddress(address)).toBe(true);
    });
  });

  describe("public addresses stay reachable", () => {
    it.each([
      "8.8.8.8",
      "1.1.1.1",
      "158.37.66.4",
      "172.15.0.1", // just below the RFC1918 block
      "172.32.0.1", // just above it
      "100.63.255.255", // just below CGNAT
      "100.128.0.1", // just above it
      "126.255.255.255", // just below loopback
      "128.0.0.1", // just above it
      "223.255.255.255", // just below multicast
      "193.0.0.1",
      "2001:4860:4860::8888",
      "::ffff:8.8.8.8",
      "fb00::1", // just below fc00::/7
      "fe00::1", // in fc00::/7's neighbourhood but outside it
    ])("allows %s", (address) => {
      expect(isBlockedAddress(address)).toBe(false);
    });
  });

  // A denylist that cannot understand an address has no basis for allowing it.
  describe("fails closed on anything unparseable", () => {
    it.each([
      "",
      "not-an-address",
      "999.999.999.999",
      "1.2.3",
      "::ffff:127.0.0.1:8080",
      "1:2:3:4:5:6:7:8:9",
      "gggg::1",
    ])("blocks %p", (address) => {
      expect(isBlockedAddress(address)).toBe(true);
    });
  });

  it("ignores a zone id when judging the address", () => {
    expect(isBlockedAddress("fe80::1%eth0")).toBe(true);
  });

  it("is not fooled by surrounding whitespace or casing", () => {
    expect(isBlockedAddress("  10.0.0.1  ")).toBe(true);
    expect(isBlockedAddress("FD00::1")).toBe(true);
  });
});
