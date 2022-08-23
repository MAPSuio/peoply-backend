import { Controller, Get, Query } from "@nestjs/common";
import { Models } from "azure-maps-rest";
import { AzureMapsService } from "./azure-maps.service";
import { AzureMapsFuzzySearchParams } from "./types/fuzzy-search.type";

@Controller("/maps")
export class AzureMapsController {
  constructor(private readonly azureMaps: AzureMapsService) {}

  @Get("/fuzzySearch")
  async searchFuzzy(
    @Query()
    params: AzureMapsFuzzySearchParams,
  ) {
    const q = params.query;

    // options is the params object without the query
    const options = Object.keys(params).reduce(
      (acc: Models.SearchGetSearchFuzzyOptionalParams, key) => {
        if (key !== "query") {
          if (key.includes("Set")) {
            acc[key] = params[key].split(",");
          } else {
            // if the key in Models.SearchGetSearchFuzzyOptionalParams is a number, convert to number
            if (Number(params[key])) {
              acc[key] = Number(params[key]);
            } else {
              acc[key] = params[key];
            }
          }
        }
        return acc;
      },
      {},
    );

    const res = await this.azureMaps.searchURL.searchFuzzy(
      this.azureMaps.aborter,
      q,
      options,
    );

    return {
      summary: res.summary,
      results: res.results,
      geojson: res.geojson,
    };
  }
}
