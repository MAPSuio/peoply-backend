import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AuthenticatedGuard } from "../auth/guards";
import { LocationSearchQueryDto } from "./dto/location-search-query.dto";
import { LocationSearchService } from "./location-search.service";

@Controller("locations")
export class LocationSearchController {
  constructor(private readonly locationSearchService: LocationSearchService) {}

  @UseGuards(AuthenticatedGuard)
  @Get("search")
  async search(@Query() query: LocationSearchQueryDto) {
    return this.locationSearchService.search(query.query, {
      countryCode: query.countryCode,
      includePoi: query.includePoi,
      lat: query.lat,
      limit: query.limit,
      lon: query.lon,
    });
  }
}
