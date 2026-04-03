import { API_BASE_URL } from "../../config";

const INVALID_LITERALS = new Set(
  ["[]", "{}", "null", "undefined", "none"].map((s) => s.toLowerCase())
);

/**
 * Returns a trimmed URL string only if it is plausible for loading as an image.
 * Rejects null, empty string, JSON-ish sentinels like "[]", and non-strings.
 */
export function getValidImageUrl(raw: unknown): string | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) return null;
  if (typeof raw !== "string") return null;
  const s = raw.replace(/^\ufeff/, "").trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  if (INVALID_LITERALS.has(lower)) return null;
  if (/^\[[\s]*\]$/i.test(s)) return null;
  if (/^\{[\s]*\}$/i.test(s)) return null;
  return s;
}

/** True when business_images_urls is null, "", [], "[]", JSON array [], or whitespace-only. */
export function isEmptyBusinessImagesPayload(raw: unknown): boolean {
  if (raw == null || raw === "") return true;
  if (Array.isArray(raw)) return raw.length === 0;
  if (typeof raw === "string") {
    const t = raw.replace(/^\ufeff/, "").trim();
    if (t === "" || t === "[]") return true;
    if (t.startsWith("[")) {
      try {
        const parsed = JSON.parse(t);
        return Array.isArray(parsed) && parsed.length === 0;
      } catch {
        return false;
      }
    }
  }
  return false;
}

/**
 * Valid image URLs from business_images_urls only (array or JSON string).
 * Does not use main_image_url. Ignores empty / [] payloads.
 */
export function parseBusinessImagesGalleryOnly(
  business_images_urls: unknown
): string[] {
  const out: string[] = [];
  if (isEmptyBusinessImagesPayload(business_images_urls)) {
    return out;
  }

  const pushFromArray = (arr: unknown[]) => {
    for (const item of arr) {
      const v = getValidImageUrl(item);
      if (v) out.push(v);
    }
  };

  if (Array.isArray(business_images_urls)) {
    pushFromArray(business_images_urls);
  } else if (typeof business_images_urls === "string") {
    const trimmed = business_images_urls.replace(/^\ufeff/, "").trim();
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          pushFromArray(parsed);
        }
      } catch {
        const v = getValidImageUrl(business_images_urls);
        if (v) out.push(v);
      }
    } else {
      const v = getValidImageUrl(business_images_urls);
      if (v) out.push(v);
    }
  }

  return Array.from(new Set(out));
}

/**
 * Ordered list for UI: valid main_image_url first (if any), then gallery URLs (no duplicates, no sentinels).
 * Empty business_images_urls / "[]" does not block using main_image_url.
 */
export function collectBusinessImageUrls(
  business_images_urls: unknown,
  main_image_url: unknown
): string[] {
  const main = getValidImageUrl(main_image_url);
  const gallery = parseBusinessImagesGalleryOnly(business_images_urls).filter(
    (u) => u !== main
  );
  if (main) {
    return [main, ...gallery];
  }
  return gallery;
}

/** __DEV__ log for tracking bad API values vs final Image URIs */
export function logPlaceImageRenderDebug(
  screenTag: string,
  place: {
    id?: number;
    main_image_url?: unknown;
    business_images_urls?: unknown;
  },
  orderedPaths: string[]
): void {
  if (!__DEV__) return;
  const resolvedUris = orderedPaths.map((p) => formatApiImageUri(p));
  console.log(`[PlaceImageDebug ${screenTag}] id=${place.id}`, {
    raw_main_image_url: place.main_image_url,
    raw_business_images_urls: place.business_images_urls,
    typeof_business: typeof place.business_images_urls,
    business_isArray: Array.isArray(place.business_images_urls),
    orderedPathsFromLogic: orderedPaths,
    finalImageUris: resolvedUris,
  });
}

/**
 * Builds a full image URI for React Native Image using the app API base URL for relative paths.
 * Returns "" if the input is not a valid image candidate (caller should not pass "" to Image).
 */
export function formatApiImageUri(
  uri: unknown,
  apiBaseUrl: string = API_BASE_URL
): string {
  const valid = getValidImageUrl(uri);
  if (!valid) {
    if (__DEV__ && uri != null && uri !== "") {
      console.warn("formatApiImageUri: skipped invalid image candidate:", uri);
    }
    return "";
  }

  if (valid === "[]" || valid === "%5B%5D") {
    return "";
  }

  const trimmedUri = valid;

  try {
    if (
      trimmedUri.startsWith("http://") ||
      trimmedUri.startsWith("https://")
    ) {
      return trimmedUri;
    }
    if (
      trimmedUri.startsWith("file://") ||
      trimmedUri.startsWith("content://") ||
      trimmedUri.startsWith("ph://")
    ) {
      return trimmedUri;
    }
    if (trimmedUri.startsWith("/")) {
      return `${apiBaseUrl}${trimmedUri}`;
    }
    if (!trimmedUri.includes("/")) {
      return `${apiBaseUrl}/uploads/${trimmedUri}`;
    }
    return `${apiBaseUrl}/${trimmedUri}`;
  } catch (error) {
    console.warn("Error formatting image URI:", trimmedUri, error);
    if (trimmedUri.startsWith("/")) {
      return `${apiBaseUrl}${trimmedUri}`;
    }
    return `${apiBaseUrl}/uploads/${trimmedUri}`;
  }
}

/**
 * Sanitize place image fields from API: main first, gallery list without main duplicate;
 * main_image_url falls back to first gallery URL only when main is missing (thumbnails).
 */
export function normalizePlaceImageFields<T extends {
  main_image_url?: string | null;
  business_images_urls?: string[] | string | null;
}>(p: T): T {
  const mainClean = getValidImageUrl(p.main_image_url);
  const galleryOnly = parseBusinessImagesGalleryOnly(
    p.business_images_urls
  ).filter((u) => u !== mainClean);

  const effectiveMain = mainClean ?? galleryOnly[0] ?? null;
  const galleryRest =
    mainClean ? galleryOnly : galleryOnly.length > 0 ? galleryOnly.slice(1) : [];

  return {
    ...p,
    main_image_url: effectiveMain as T["main_image_url"],
    business_images_urls: (galleryRest.length > 0
      ? galleryRest
      : null) as T["business_images_urls"],
  };
}
