import {
  ImageContainer,
  containerStoresBrandColors,
} from "./image-storage.constants";

describe("containerStoresBrandColors", () => {
  it("is true for organization logos, which the calendar colors itself from", () => {
    expect(containerStoresBrandColors(ImageContainer.ORGANIZATION_IMAGES)).toBe(
      true,
    );
  });

  it("is false for the containers with nowhere to keep the colors", () => {
    expect(containerStoresBrandColors(ImageContainer.PROFILE_IMAGES)).toBe(
      false,
    );
    expect(containerStoresBrandColors(ImageContainer.EVENT_IMAGES)).toBe(false);
  });
});
