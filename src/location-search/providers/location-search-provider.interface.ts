import type {
  LocationSearchOptions,
  LocationSearchProviderName,
  LocationSearchResponse,
} from "../location-search.types";

export interface LocationSearchProvider {
  readonly name: LocationSearchProviderName;
  search(
    query: string,
    options: LocationSearchOptions,
  ): Promise<LocationSearchResponse>;
}
