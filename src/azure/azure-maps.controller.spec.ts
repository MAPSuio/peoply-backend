import { plainToInstance } from "class-transformer";
import { AzureMapsController } from "./azure-maps.controller";
import { AzureMapsFuzzySearchQueryDto } from "./dto/azure-maps-fuzzy-search-query.dto";

describe("AzureMapsController", () => {
  it("passes transformed query params to Azure without losing zero values", async () => {
    const searchFuzzy = jest.fn().mockResolvedValue({
      geojson: { type: "FeatureCollection", features: [] },
      results: [],
      summary: { query: "Oslo" },
    });
    const controller = new AzureMapsController({
      aborter: "aborter",
      searchURL: { searchFuzzy },
    } as any);
    const params = plainToInstance(AzureMapsFuzzySearchQueryDto, {
      query: "  Oslo  ",
      countrySet: "NO,SE",
      idxSet: "Addr,POI",
      ofs: "0",
      typeahead: "false",
      limit: "5",
    });

    await controller.searchFuzzy(params);

    expect(searchFuzzy).toHaveBeenCalledWith("aborter", "Oslo", {
      countrySet: ["NO", "SE"],
      idxSet: ["Addr", "POI"],
      limit: 5,
      ofs: 0,
      typeahead: false,
    });
  });
});
