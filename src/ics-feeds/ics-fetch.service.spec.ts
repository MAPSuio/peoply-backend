import { createPinnedLookup } from "./ics-fetch.service";

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
