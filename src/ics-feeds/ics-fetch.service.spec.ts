import * as http from "node:http";
import type { AddressInfo } from "node:net";
import {
  createPinnedLookup,
  IcsFetchService,
  TOTAL_DEADLINE_MS,
} from "./ics-fetch.service";

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

describe("IcsFetchService IPv6 literal hosts", () => {
  const service = new IcsFetchService();

  /* `new URL("https://[::1]/").hostname` keeps the brackets and `isIP` rejects
     the bracketed form, so these never reached the address check at all - they
     fell through to a DNS lookup that happened to fail. Rejecting on an
     accident is not the same as rejecting on a rule. They reject before any
     socket is opened, so nothing here touches the network. */
  it.each([
    ["https://[::1]/cal.ics", "loopback"],
    ["https://[fd00::1]/cal.ics", "unique local"],
    ["https://[fe80::1]/cal.ics", "link local"],
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

describe("IcsFetchService total request deadline", () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("includes DNS resolution in the total deadline", async () => {
    jest.useFakeTimers();
    const service = new IcsFetchService();
    jest
      .spyOn(service as any, "resolveAddresses")
      .mockReturnValue(new Promise(() => undefined));

    const fetch = service.fetchCalendar("https://example.com/cal.ics");
    const rejection = expect(fetch).rejects.toThrow(
      "ICS request took too long",
    );
    await jest.advanceTimersByTimeAsync(TOTAL_DEADLINE_MS);

    await rejection;
  });

  /* Drips a byte every 20ms and never ends the response, so the 15s socket
     timeout never fires. Bound to 127.0.0.1 and driven through makeRequest
     directly - the address filter sits in assertSafeUrl, one layer up, and
     would refuse loopback before we ever got to test the deadline. */
  let server: http.Server;
  let dripTimer: NodeJS.Timeout;
  let port: number;

  beforeAll(async () => {
    server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/calendar" });
      dripTimer = setInterval(() => res.write("X"), 20);
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", () => resolve()),
    );
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    clearInterval(dripTimer);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("gives up on a server that never stops trickling", async () => {
    const service = new IcsFetchService();
    const makeRequest = (
      service as unknown as {
        makeRequest: (u: URL, a: string, d: number) => Promise<unknown>;
      }
    ).makeRequest.bind(service);

    await expect(
      makeRequest(
        new URL(`http://127.0.0.1:${port}/cal.ics`),
        "127.0.0.1",
        Date.now() + 300,
      ),
    ).rejects.toThrow("ICS request took too long");
  });
});
