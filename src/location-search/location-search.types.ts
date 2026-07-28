export type LocationSearchProviderName = "entur" | "geonorge";

export interface LocationSearchCoordinate {
  lat?: number;
  lon?: number;
}

export interface LocationSearchResultAddress {
  country?: string;
  countryCode?: string;
  countryCodeISO3?: string;
  countrySubdivision?: string;
  freeformAddress?: string;
  localName?: string;
  municipality?: string;
  postalCode?: string;
  streetName?: string;
  streetNumber?: string;
}

export interface LocationSearchResultPoi {
  name?: string;
}

export interface LocationSearchResult {
  id: string;
  provider: LocationSearchProviderName;
  source?: string;
  type: string;
  address?: LocationSearchResultAddress;
  poi?: LocationSearchResultPoi;
  position?: LocationSearchCoordinate;
}

export interface LocationSearchResponse {
  results: LocationSearchResult[];
}

export interface LocationSearchOptions {
  countryCode?: string;
  includePoi?: boolean;
  lat?: number;
  limit?: number;
  lon?: number;
}
