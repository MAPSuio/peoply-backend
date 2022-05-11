import { Models } from "azure-maps-rest";

export type AzureMapsFuzzySearchParams = { query: string } & (
  | Models.SearchGetSearchFuzzyOptionalParams
  | undefined
);
