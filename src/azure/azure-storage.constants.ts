export enum AzureStorageContainer {
  PROFILE_IMAGES = "profile-images",
  EVENT_IMAGES = "event-images",
  ORGANIZATION_IMAGES = "organization-images",
}

export function containerStoresBrandColors(container: AzureStorageContainer) {
  return container === AzureStorageContainer.ORGANIZATION_IMAGES;
}
