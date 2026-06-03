import { getValidImageUrl } from "./imageUrl";

/**
 * Payload for POST/PUT place image fields:
 * - main_image_url: single primary/thumbnail URL (first image).
 * - business_images_urls: gallery array (2+ images). With one image, gallery is null
 *   so legacy rows that only have main_image_url keep working.
 * UI merges both via collectBusinessImageUrls without duplicates.
 */
export function sanitizeBusinessImagesForApi(images: string[]): {
  business_images_urls: string[] | null;
  main_image_url: string | null;
} {
  const cleaned = images
    .filter(
      (u) =>
        typeof u === "string" &&
        u.length > 0 &&
        !u.startsWith("__uploading__")
    )
    .map((u) => getValidImageUrl(u))
    .filter((u): u is string => u != null);
  if (cleaned.length === 0) {
    return { business_images_urls: null, main_image_url: null };
  }
  const main = getValidImageUrl(cleaned[0]);
  const rest = cleaned.slice(1);
  return {
    main_image_url: main,
    business_images_urls: rest.length > 0 ? rest : null,
  };
}
