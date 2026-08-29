import type { ImageChange } from "../azure/azure-storage.service";

export function organizationImageColumns(change: ImageChange) {
  if (change === undefined) return {};

  return {
    image: change.image,
    imagePrimaryColor: change.colors?.primary ?? null,
    imageAccentColor: change.colors?.accent ?? null,
  };
}
