import { BadGatewayException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  LocationSearchOptions,
  LocationSearchResponse,
  LocationSearchResult,
} from "../location-search.types";
import { fetchJsonWithTimeout } from "./fetch-json";
import type { LocationSearchProvider } from "./location-search-provider.interface";

const ENTUR_BASE_URL = "https://api.entur.io/geocoder/v3/autocomplete";
const ENTUR_DEFAULT_LIMIT = 5;
const ENTUR_DEFAULT_RADIUS_KM = 50;
const ENTUR_DEFAULT_WEIGHT = 0.5;

interface EnturFeatureCollection {
  features?: EnturFeature[];
}

interface EnturFeature {
  geometry?: {
    coordinates?: [number, number];
  };
  properties?: {
    address?: {
      borough?: string;
      countryCode?: string;
      county?: string;
      houseNumber?: string;
      locality?: string;
      postalCode?: string;
      streetName?: string;
    };
    id?: string;
    layer?: string;
    names?: {
      default?: string;
      display?: string;
    };
    source?: string;
  };
}

@Injectable()
export class EnturGeocoderProvider implements LocationSearchProvider {
  readonly name = "entur" as const;

  constructor(private readonly configService: ConfigService) {}

  async search(
    query: string,
    options: LocationSearchOptions,
  ): Promise<LocationSearchResponse> {
    const clientName = this.configService.get<string>(
      "ENTUR_GEOCODER_CLIENT_NAME",
    );
    if (!clientName) {
      throw new BadGatewayException(
        "ENTUR_GEOCODER_CLIENT_NAME must be set when LOCATION_SEARCH_PROVIDER=entur",
      );
    }

    const params = new URLSearchParams({
      q: query,
      lang: "no",
      limit: String(options.limit ?? ENTUR_DEFAULT_LIMIT),
      countries: (options.countryCode ?? "NO").toUpperCase(),
      layers: options.includePoi
        ? "poi,address,street,place"
        : "address,street,place",
      sources: options.includePoi
        ? "kartverket-matrikkelenadresse,kartverket-stedsnavn,openstreetmap"
        : "kartverket-matrikkelenadresse,kartverket-stedsnavn",
    });

    if (options.lat !== undefined && options.lon !== undefined) {
      params.set("lat", String(options.lat));
      params.set("lon", String(options.lon));
      params.set("radius", String(ENTUR_DEFAULT_RADIUS_KM));
      params.set("weight", String(ENTUR_DEFAULT_WEIGHT));
    }

    const body = await this.fetchJson<EnturFeatureCollection>(
      `${ENTUR_BASE_URL}?${params.toString()}`,
      {
        headers: {
          "ET-Client-Name": clientName,
        },
      },
    );

    return {
      results: (body.features ?? []).map((feature) =>
        this.normalizeFeature(feature),
      ),
    };
  }

  private normalizeFeature(feature: EnturFeature): LocationSearchResult {
    const coordinates = feature.geometry?.coordinates;
    const properties = feature.properties;
    const address = properties?.address;
    const layer = properties?.layer ?? "address";
    const defaultName = properties?.names?.default;
    const displayName = properties?.names?.display ?? defaultName ?? "";
    const isPoiLike =
      layer === "poi" || layer === "place" || layer === "stopPlace";

    return {
      id: properties?.id ?? displayName,
      provider: this.name,
      source: properties?.source,
      type: layer,
      poi: isPoiLike && defaultName ? { name: defaultName } : undefined,
      address: {
        country:
          address?.countryCode?.toLowerCase() === "no" ? "Norge" : undefined,
        countryCode: address?.countryCode?.toUpperCase(),
        countryCodeISO3:
          address?.countryCode?.toLowerCase() === "no" ? "NOR" : undefined,
        countrySubdivision: address?.county,
        freeformAddress:
          isPoiLike && defaultName
            ? this.formatAddressLine(address)
            : displayName || this.formatAddressLine(address),
        localName: address?.borough,
        municipality: address?.locality,
        postalCode: address?.postalCode,
        streetName: address?.streetName,
        streetNumber: address?.houseNumber,
      },
      position: coordinates
        ? {
            lon: coordinates[0],
            lat: coordinates[1],
          }
        : undefined,
    };
  }

  private formatAddressLine(
    address:
      | {
          houseNumber?: string;
          locality?: string;
          postalCode?: string;
          streetName?: string;
        }
      | undefined,
  ) {
    if (!address) {
      return undefined;
    }

    const street =
      address.streetName && address.houseNumber
        ? `${address.streetName} ${address.houseNumber}`
        : address.streetName;
    const locality = [address.postalCode, address.locality]
      .filter(Boolean)
      .join(" ");

    return [street, locality].filter(Boolean).join(", ") || undefined;
  }

  private fetchJson<T>(url: string, init?: RequestInit) {
    return fetchJsonWithTimeout<T>("Entur geocoder", url, init);
  }
}
