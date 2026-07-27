import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { Models } from "azure-maps-rest";
import { AuthenticatedGuard } from "../auth/guards";
import { AzureMapsFuzzySearchQueryDto } from "./dto/azure-maps-fuzzy-search-query.dto";
import { AzureMapsService } from "./azure-maps.service";

@Controller("/maps")
export class AzureMapsController {
  constructor(private readonly azureMaps: AzureMapsService) {}

  @UseGuards(AuthenticatedGuard)
  @Get("/fuzzySearch")
  async searchFuzzy(
    @Query()
    params: AzureMapsFuzzySearchQueryDto,
  ) {
    const { query, ...rawOptions } = params;
    const options = Object.fromEntries(
      Object.entries(rawOptions).filter(([, value]) => value !== undefined),
    ) as Models.SearchGetSearchFuzzyOptionalParams;

    const res = await this.azureMaps.searchURL.searchFuzzy(
      this.azureMaps.aborter,
      query,
      options,
    );

    return {
      summary: res.summary,
      results: res.results,
      geojson: res.geojson,
    };
  }
}
