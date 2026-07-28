# Location Search

This document explains the old address-search flow, why it was replaced, and
how the current location-search architecture works.

## Previous implementation

Until July 2026, Peoply used a thin Azure Maps proxy:

- The backend exposed `GET /maps/fuzzySearch`, guarded by auth, and forwarded
  query parameters almost directly to Azure Maps `searchFuzzy`.
- The frontend depended on Azure-shaped response types in
  `types/azureMaps.ts`, stored those provider objects in form state, and posted
  selected address fields into the event create/edit payloads.
- The backend never validated or enriched the chosen location beyond the normal
  event DTO validation. Search happened only at selection time; persisted events
  store normalized address fields plus lat/lon.

### Limitations of the old design

- Provider lock-in: Azure-specific fields leaked from the backend all the way
  into shared frontend components and edit flows.
- Deprecated dependency chain: the backend used `azure-maps-rest`, which sits
  on the old `@azure/ms-rest-js` stack.
- Weak documentation of data provenance: the code did not clearly explain what
  data source or ranking strategy we were relying on for Norwegian addresses.
- Hard to compare or replace: there was no provider abstraction, so changing the
  geocoder meant touching controller code, frontend types, frontend services,
  and every form that consumed search results.
- Query handling was stringly typed: the proxy parsed optional params ad hoc and
  pushed them through with minimal validation.

## Provider evaluation

The replacement work compared Norway-suitable public providers on July 27, 2026.
The emphasis was Norwegian address quality, autocomplete behaviour, low
integration risk, and long-term maintainability.

| Provider | Strengths | Weaknesses | Verdict |
| --- | --- | --- | --- |
| Kartverket / Geonorge Address API | Official Matrikkelen address source, no registration, CC BY 4.0, exact address data | No dedicated autocomplete endpoint, weaker typo tolerance, no POIs, more client heuristics needed | Keep as supported fallback / optional provider |
| Entur Geocoder v3 | Norway-focused autocomplete API, structured response, proximity bias, typo-tolerant in spot checks, explicit Kartverket-backed sources available, ET-Client-Name only | Not the canonical source itself, optional POI layer adds OSM-derived data, depends on Entur API evolution | Best default |
| Nominatim public API | Good free-form search, broad OSM coverage | Public policy explicitly forbids autocomplete-style use, 1 req/s cap, ODbL share-alike obligations | Not suitable for this UI |
| Self-hosted Pelias | Excellent abstraction, autocomplete, open source, extensible | Significant operational burden, indexing/import pipeline to own, unnecessary for current scale | Overkill for this project |

### Notes from live spot checks

These were one-off checks from Oslo on July 27, 2026, not a formal benchmark:

- Geonorge returned the exact official address for `Gaustadalleen 23B` only
  when the query matched the official spelling; the accentless typo returned no
  result.
- Entur v3, filtered to Kartverket-backed address sources, returned the correct
  `Gaustadalléen 23B` result for the same accentless typo.
- Entur v3 also returned POI-style results when `openstreetmap` POIs were
  enabled, which preserves the old "venue plus address" UX better than direct
  Geonorge.
- One-off latency samples were roughly `0.58s` for Geonorge and `0.20s` for
  Entur v3 for the tested exact address lookup.

## Chosen solution

Peoply now defaults to **Entur Geocoder v3**, configured to search:

- `kartverket-matrikkelenadresse` for official addresses
- `kartverket-stedsnavn` for named places
- `openstreetmap` for POIs when the caller enables POIs

This gives us better autocomplete and typo handling while still grounding
address results in official Norwegian data where it matters.

Direct Geonorge support remains available behind the same abstraction for cases
where a strict official-address-only provider is preferred.

## Current architecture

### Backend module

`src/location-search/` contains the new search layer:

- `location-search.controller.ts`
  - Authenticated `GET /locations/search`
- `location-search.service.ts`
  - Applies default options and selects the configured provider
- `location-search.types.ts`
  - Provider-neutral result contract shared by all implementations
- `providers/entur-geocoder.provider.ts`
  - Default autocomplete provider
- `providers/geonorge-address.provider.ts`
  - Direct official-address provider

### Normalized result contract

The backend now returns a provider-neutral structure:

- `id`, `provider`, `source`, `type`
- `poi.name` when the result is a named place or venue
- `address.*` for display and persistence fields
- `position.lat` / `position.lon`

Frontend code should depend on this contract only. Provider-specific payloads
must be normalized in the backend provider implementation.

### Event persistence

Event storage is unchanged in shape:

- The frontend still posts `poiName`, `country`, `countryCode`,
  `countryCodeISO3`, `countrySubdivision`, `localName`, `municipality`,
  `postalCode`, `streetName`, `streetNumber`, `freeformAddress`, `latitude`,
  and `longitude`.
- The event DTOs and Prisma schema remain the canonical persisted shape.

## Configuration

Set these in the backend environment:

```env
LOCATION_SEARCH_PROVIDER=entur
ENTUR_GEOCODER_CLIENT_NAME=your-company-your-app
```

### Provider values

- `entur`
  - Default. Requires `ENTUR_GEOCODER_CLIENT_NAME`.
- `geonorge`
  - Uses Kartverket's direct Address API and does not require extra credentials.

## Extension points

To add another provider later:

1. Implement `LocationSearchProvider`.
2. Normalize its payload into `LocationSearchResponse`.
3. Register it in `LocationSearchModule`.
4. Extend the provider switch in `LocationSearchService`.

No frontend changes should be needed unless the normalized contract itself must
grow.
