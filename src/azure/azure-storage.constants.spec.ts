import {
  AzureStorageContainer,
  containerStoresBrandColors,
} from "./azure-storage.constants";

describe("containerStoresBrandColors", () => {
  it("is true for organization logos, which the calendar colors itself from", () => {
    expect(
      containerStoresBrandColors(AzureStorageContainer.ORGANIZATION_IMAGES),
    ).toBe(true);
  });

  it("is false for the containers with nowhere to keep the colors", () => {
    expect(
      containerStoresBrandColors(AzureStorageContainer.PROFILE_IMAGES),
    ).toBe(false);
    expect(containerStoresBrandColors(AzureStorageContainer.EVENT_IMAGES)).toBe(
      false,
    );
  });
});
