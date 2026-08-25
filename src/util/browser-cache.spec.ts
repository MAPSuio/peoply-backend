import { HEADERS_METADATA } from "@nestjs/common/constants";
import { AllergensController } from "../allergens/allergens.controller";
import { CategoriesController } from "../categories/categories.controller";
import { PopupsController } from "../popups/popups.controller";
import { BROWSER_CACHE_TTL, BrowserCacheFor } from "./browser-cache";

function cacheControlOf(handler: object): string | undefined {
  const headers = Reflect.getMetadata(HEADERS_METADATA, handler) as
    | { name: string; value: string }[]
    | undefined;
  return headers?.find((header) => header.name === "Cache-Control")?.value;
}

describe("BrowserCacheFor", () => {
  it("marks the response cacheable by that browser only, for the given time", () => {
    class Sample {
      @BrowserCacheFor(120)
      handler() {}
    }

    expect(cacheControlOf(Sample.prototype.handler)).toBe(
      "private, max-age=120",
    );
  });
});

describe("reference data responses", () => {
  it("lets the browser reuse the allergen list", () => {
    expect(cacheControlOf(AllergensController.prototype.findAll)).toBe(
      `private, max-age=${BROWSER_CACHE_TTL.referenceTables}`,
    );
  });

  it("lets the browser reuse the category list", () => {
    expect(cacheControlOf(CategoriesController.prototype.findAll)).toBe(
      `private, max-age=${BROWSER_CACHE_TTL.referenceTables}`,
    );
  });

  it("lets the browser briefly reuse the active popup", () => {
    expect(cacheControlOf(PopupsController.prototype.findActive)).toBe(
      `private, max-age=${BROWSER_CACHE_TTL.scheduledContent}`,
    );
  });
});
