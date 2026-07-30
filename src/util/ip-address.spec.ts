import { isPrivateOrReservedAddress } from "./ip-address";

describe("isPrivateOrReservedAddress", () => {
  describe("blocks addresses the old prefix matching let through", () => {
    it.each([
      ["127.0.0.2", "the rest of 127.0.0.0/8 is localhost too"],
      ["127.1.1.1", "so is 127.1.1.1"],
      ["0.0.0.1", "0.0.0.0/8"],
      ["100.64.0.1", "RFC6598 CGNAT"],
      ["100.127.255.254", "top of the CGNAT range"],
      ["168.63.129.16", "Azure Wire Server"],
      ["198.18.0.1", "benchmarking range"],
      ["224.0.0.1", "multicast"],
      ["255.255.255.255", "broadcast"],
      ["0:0:0:0:0:0:0:1", "loopback written out in full"],
      ["::", "unspecified"],
      ["::ffff:10.0.0.1", "IPv4-mapped RFC1918"],
      ["::ffff:169.254.169.254", "IPv4-mapped cloud metadata"],
      ["::ffff:0a00:0001", "IPv4-mapped written as hex groups"],
    ])("blocks %s (%s)", (address) => {
      expect(isPrivateOrReservedAddress(address)).toBe(true);
    });
  });

  describe("keeps blocking what was already blocked", () => {
    it.each([
      "127.0.0.1",
      "0.0.0.0",
      "::1",
      "10.0.0.1",
      "192.168.1.1",
      "172.16.0.1",
      "172.31.255.255",
      "169.254.169.254",
      "fd00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
    ])("blocks %s", (address) => {
      expect(isPrivateOrReservedAddress(address)).toBe(true);
    });
  });

  describe("allows genuinely public addresses", () => {
    it.each([
      ["1.1.1.1", "Cloudflare"],
      ["8.8.8.8", "Google DNS"],
      ["93.184.216.34", "example.com"],
      ["172.15.255.255", "just below 172.16.0.0/12"],
      ["172.32.0.1", "just above 172.16.0.0/12"],
      ["100.63.255.255", "just below the CGNAT range"],
      ["100.128.0.0", "just above the CGNAT range"],
      ["168.63.129.17", "neighbour of the Azure Wire Server"],
      ["2001:4860:4860::8888", "Google public DNS over IPv6"],
      ["2606:4700:4700::1111", "Cloudflare over IPv6"],
    ])("allows %s (%s)", (address) => {
      expect(isPrivateOrReservedAddress(address)).toBe(false);
    });
  });

  describe("fails closed", () => {
    it.each(["", "not-an-ip", "999.1.1.1", "::ffff:127.0.0.1.5", "12345"])(
      "blocks %s rather than guessing",
      (address) => {
        expect(isPrivateOrReservedAddress(address)).toBe(true);
      },
    );
  });
});
