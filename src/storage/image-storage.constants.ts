export enum ImageContainer {
  PROFILE_IMAGES = "profile-images",
  EVENT_IMAGES = "event-images",
  ORGANIZATION_IMAGES = "organization-images",
}

export function containerStoresBrandColors(container: ImageContainer) {
  return container === ImageContainer.ORGANIZATION_IMAGES;
}
