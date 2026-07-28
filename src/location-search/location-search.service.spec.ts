import { LocationSearchService } from "./location-search.service";

describe("LocationSearchService", () => {
  const config = {
    get: jest.fn(),
  };
  const enturProvider = {
    search: jest.fn(),
  };
  const geonorgeProvider = {
    search: jest.fn(),
  };

  let service: LocationSearchService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new LocationSearchService(
      config as any,
      enturProvider as any,
      geonorgeProvider as any,
    );
  });

  it("uses Entur by default with normalized default options", async () => {
    config.get.mockReturnValue(undefined);
    enturProvider.search.mockResolvedValueOnce({ results: [] });

    await service.search("  Gaustadall  ", {});

    expect(enturProvider.search).toHaveBeenCalledWith("Gaustadall", {
      countryCode: "NO",
      includePoi: true,
      lat: undefined,
      limit: 5,
      lon: undefined,
    });
    expect(geonorgeProvider.search).not.toHaveBeenCalled();
  });

  it("switches to Geonorge when configured", async () => {
    config.get.mockReturnValue("geonorge");
    geonorgeProvider.search.mockResolvedValueOnce({ results: [] });

    await service.search("Gaustadall", {
      countryCode: "SE",
      includePoi: false,
      limit: 3,
    });

    expect(geonorgeProvider.search).toHaveBeenCalledWith("Gaustadall", {
      countryCode: "SE",
      includePoi: false,
      lat: undefined,
      limit: 3,
      lon: undefined,
    });
    expect(enturProvider.search).not.toHaveBeenCalled();
  });
});
