import { EnturGeocoderProvider } from "./entur-geocoder.provider";

describe("EnturGeocoderProvider", () => {
  const config = {
    get: jest.fn(),
  };

  let provider: EnturGeocoderProvider;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new EnturGeocoderProvider(config as any);
    fetchMock = jest.fn();
    global.fetch = fetchMock as any;
    config.get.mockReturnValue("peoply-test");
  });

  it("requests Entur v3 and normalizes address results", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        features: [
          {
            geometry: { coordinates: [10.717823, 59.94342] },
            properties: {
              id: "KVE:PostalAddress:285695183",
              layer: "address",
              source: "kartverket-matrikkelenadresse",
              names: {
                default: "Gaustadalléen 23B",
                display: "Gaustadalléen 23B, Oslo",
              },
              address: {
                streetName: "Gaustadalléen",
                houseNumber: "23B",
                postalCode: "0373",
                locality: "Oslo",
                borough: "Blindern",
                county: "Oslo",
                countryCode: "no",
              },
            },
          },
        ],
      }),
    });

    const result = await provider.search("Gaustadalleen 23B", {
      countryCode: "NO",
      includePoi: true,
      lat: 59.9434,
      lon: 10.7178,
      limit: 5,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/geocoder/v3/autocomplete?"),
      expect.objectContaining({
        headers: {
          "ET-Client-Name": "peoply-test",
        },
      }),
    );

    expect(fetchMock.mock.calls[0][0]).toEqual(
      expect.stringContaining("q=Gaustadalleen+23B"),
    );
    expect(fetchMock.mock.calls[0][0]).toEqual(
      expect.stringContaining(
        "sources=kartverket-matrikkelenadresse%2Ckartverket-stedsnavn%2Copenstreetmap",
      ),
    );
    expect(fetchMock.mock.calls[0][0]).toEqual(
      expect.stringContaining("layers=poi%2Caddress%2Cstreet%2Cplace"),
    );

    expect(result).toEqual({
      results: [
        {
          id: "KVE:PostalAddress:285695183",
          provider: "entur",
          source: "kartverket-matrikkelenadresse",
          type: "address",
          address: {
            country: "Norge",
            countryCode: "NO",
            countryCodeISO3: "NOR",
            countrySubdivision: "Oslo",
            freeformAddress: "Gaustadalléen 23B, Oslo",
            localName: "Blindern",
            municipality: "Oslo",
            postalCode: "0373",
            streetName: "Gaustadalléen",
            streetNumber: "23B",
          },
          poi: undefined,
          position: {
            lat: 59.94342,
            lon: 10.717823,
          },
        },
      ],
    });
  });
});
