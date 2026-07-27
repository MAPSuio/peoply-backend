import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EnturGeocoderProvider } from "./providers/entur-geocoder.provider";
import { GeonorgeAddressProvider } from "./providers/geonorge-address.provider";
import type { LocationSearchProvider } from "./providers/location-search-provider.interface";
import type {
  LocationSearchOptions,
  LocationSearchProviderName,
  LocationSearchResponse,
} from "./location-search.types";

const DEFAULT_PROVIDER = "entur";
const DEFAULT_LIMIT = 5;

@Injectable()
export class LocationSearchService {
  constructor(
    private readonly configService: ConfigService,
    private readonly enturProvider: EnturGeocoderProvider,
    private readonly geonorgeProvider: GeonorgeAddressProvider,
  ) {}

  async search(
    query: string,
    options: LocationSearchOptions,
  ): Promise<LocationSearchResponse> {
    const normalizedQuery = query.trim();

    return this.getProvider().search(normalizedQuery, {
      countryCode: options.countryCode ?? "NO",
      includePoi: options.includePoi ?? true,
      lat: options.lat,
      limit: options.limit ?? DEFAULT_LIMIT,
      lon: options.lon,
    });
  }

  private getProvider(): LocationSearchProvider {
    const configuredProvider =
      this.configService.get<LocationSearchProviderName>(
        "LOCATION_SEARCH_PROVIDER",
      ) ?? DEFAULT_PROVIDER;

    switch (configuredProvider) {
      case "geonorge":
        return this.geonorgeProvider;
      default:
        return this.enturProvider;
    }
  }
}
