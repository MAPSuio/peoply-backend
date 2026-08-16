import { Injectable } from "@nestjs/common";
import type {
  LocationSearchOptions,
  LocationSearchResponse,
  LocationSearchResult,
} from "../location-search.types";
import { fetchJsonWithTimeout } from "./fetch-json";
import type { LocationSearchProvider } from "./location-search-provider.interface";

const GEONORGE_BASE_URL = "https://ws.geonorge.no/adresser/v1/sok";
const GEONORGE_DEFAULT_LIMIT = 5;

interface GeonorgeAddressResponse {
  adresser?: GeonorgeAddress[];
}

interface GeonorgeAddress {
  adressekode?: number;
  adressetekst?: string;
  bokstav?: string;
  kommunenavn?: string;
  kommunenummer?: string;
  nummer?: number;
  postnummer?: string;
  poststed?: string;
  representasjonspunkt?: {
    lat?: number;
    lon?: number;
  };
}

@Injectable()
export class GeonorgeAddressProvider implements LocationSearchProvider {
  readonly name = "geonorge" as const;

  async search(
    query: string,
    options: LocationSearchOptions,
  ): Promise<LocationSearchResponse> {
    const params = new URLSearchParams({
      sok: query,
      treffPerSide: String(options.limit ?? GEONORGE_DEFAULT_LIMIT),
      side: "0",
    });

    let body = await this.fetchJson<GeonorgeAddressResponse>(
      `${GEONORGE_BASE_URL}?${params.toString()}`,
    );

    if (!body.adresser?.length && !query.endsWith("*")) {
      params.set("sok", `${query}*`);
      body = await this.fetchJson<GeonorgeAddressResponse>(
        `${GEONORGE_BASE_URL}?${params.toString()}`,
      );
    }

    return {
      results: (body.adresser ?? []).map((address) =>
        this.normalizeAddress(address),
      ),
    };
  }

  private normalizeAddress(address: GeonorgeAddress): LocationSearchResult {
    const streetNumber = [address.nummer, address.bokstav]
      .filter((value) => value !== undefined && value !== "")
      .join("");
    const locality = [address.postnummer, address.poststed]
      .filter(Boolean)
      .join(" ");

    return {
      id: ["geonorge", address.kommunenummer, address.adressekode, streetNumber]
        .filter(Boolean)
        .join(":"),
      provider: this.name,
      source: "kartverket-matrikkelenadresse",
      type: "address",
      address: {
        country: "Norge",
        countryCode: "NO",
        countryCodeISO3: "NOR",
        freeformAddress: [address.adressetekst, locality]
          .filter(Boolean)
          .join(", "),
        localName: address.poststed,
        municipality: address.kommunenavn,
        postalCode: address.postnummer,
        streetNumber: streetNumber || undefined,
      },
      position: {
        lat: address.representasjonspunkt?.lat,
        lon: address.representasjonspunkt?.lon,
      },
    };
  }

  private fetchJson<T>(url: string) {
    return fetchJsonWithTimeout<T>("Geonorge address", url);
  }
}
