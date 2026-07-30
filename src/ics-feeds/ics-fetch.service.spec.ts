import { createPinnedLookup, IcsFetchService } from "./ics-fetch.service";

describe("createPinnedLookup", () => {
  it("returns an address array when called with { all: true } (Node >= 20 autoSelectFamily)", () => {
    const callback = jest.fn();

    createPinnedLookup("158.37.66.4")("example.com", { all: true }, callback);

    expect(callback).toHaveBeenCalledWith(null, [
      { address: "158.37.66.4", family: 4 },
    ]);
  });

  it("returns (err, address, family) when called without { all }", () => {
    const callback = jest.fn();

    createPinnedLookup("158.37.66.4")("example.com", {}, callback);

    expect(callback).toHaveBeenCalledWith(null, "158.37.66.4", 4);
  });

  it("reports family 6 for IPv6 addresses", () => {
    const callback = jest.fn();

    createPinnedLookup("2001:db8::1")("example.com", { all: true }, callback);

    expect(callback).toHaveBeenCalledWith(null, [
      { address: "2001:db8::1", family: 6 },
    ]);
  });
});

describe("IcsFetchService.fetchCalendar address filtering", () => {
  const service = new IcsFetchService();

  /* These reject before any socket is opened, so nothing here touches the
     network. Six of them were reachable before the CIDR-based check - the two
     IPv6 literals were stopped only by the DNS lookup failing on the brackets
     URL leaves on the hostname, which is not a guarantee. */
  it.each([
    ["https://127.0.0.2/cal.ics", "rest of 127.0.0.0/8"],
    ["https://127.1.1.1/cal.ics", "rest of 127.0.0.0/8"],
    ["https://100.64.0.1/cal.ics", "CGNAT"],
    ["https://168.63.129.16/metadata", "Azure Wire Server"],
    ["https://[0:0:0:0:0:0:0:1]/cal.ics", "loopback written out in full"],
    ["https://[::ffff:169.254.169.254]/x", "IPv4-mapped cloud metadata"],
    ["https://169.254.169.254/latest/meta-data/", "cloud metadata"],
    ["https://10.0.0.1/cal.ics", "RFC1918"],
  ])("refuses %s (%s)", async (url) => {
    await expect(service.fetchCalendar(url)).rejects.toThrow(
      "ICS URL points to a blocked address",
    );
  });

  it("still refuses plain HTTP", async () => {
    await expect(
      service.fetchCalendar("http://example.com/cal.ics"),
    ).rejects.toThrow("Only HTTPS ICS URLs are supported");
  });
});
