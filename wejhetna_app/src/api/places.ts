// src/api/places.ts

export type City = {
  id: number;
  name_ar: string;
  name_he?: string;
  name_en?: string;
};

export type Category = {
  id: number;
  name_ar: string;
  name_he?: string;
  name_en?: string;
  icon_name?: string;
  is_active: boolean;
};

export type PlaceType = "PUBLIC_SERVICE" | "BUSINESS";

export type Location = {
  id: number;
  lat: number;
  lon: number;
  source: string;
  osm_id?: string | null;
};

export type PlaceForMap = {
  id: number;
  name: string;
  name_ar: string;
  name_he: string;
  place_type: PlaceType;

  can_be_claimed: boolean;
  description?: string | null;
  phone?: string | null;
  opening_hours?: string | null;
  main_image_url?: string | null;
  business_images_urls?: string[] | null; // Array of business image URLs
  social_links?: string | null;
  announcement?: string | null; // Business announcements/important news
  owner_user_id?: number | null; // ID of the business owner who owns this place

  city: City;
  category?: Category | null;
  location: Location;

  // created_at / updated_at קיימים ב־backend, אבל לא חובה שנשתמש פה כרגע
};
export type GpsOsmCheckResult = {
  match_found: boolean;
  osm_id?: string | null;
};

const BASE_URL = "http://10.0.2.2:8000"; // אנדרואיד אמולטור → FastAPI

// =======================
// FETCH CITIES
// =======================
export async function fetchCities(): Promise<City[]> {
  const res = await fetch(`${BASE_URL}/admin/cities`);
  if (!res.ok) throw new Error("Failed to fetch cities");
  return res.json();
}

// =======================
// CHECK LOCATION IN SERVICE CITIES
// =======================
export type BoundaryCheckResult = {
  is_within: boolean;
  city_id: number | null;
  city_name_ar: string | null;
  city_name_he: string | null;
  city_name_en: string | null;
};

export async function checkLocationInServiceCities(
  lat: number,
  lon: number
): Promise<BoundaryCheckResult> {
  try {
    const res = await fetch(`${BASE_URL}/cities/check-boundary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lon }),
    });
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error(`Boundary check failed: ${res.status} - ${errorText}`);
      throw new Error(`Failed to check location boundary: ${res.status} ${errorText}`);
    }
    
    return res.json();
  } catch (error) {
    // אם זה network error, נזרוק שגיאה ברורה יותר
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error("Cannot connect to server. Please check if the backend is running.");
    }
    throw error;
  }
}

// =======================
// FETCH CATEGORIES
// =======================
export async function fetchCategories(): Promise<Category[]> {
  const res = await fetch(`${BASE_URL}/admin/categories`);
  if (!res.ok) throw new Error("Failed to fetch categories");
  return res.json();
}

// =======================
// CREATE PLACE (admin)
// =======================
export async function createAdminPlace(data: any) {
  // 1) קודם נביא את כל המקומות כדי לבדוק כפילויות
  let existingPlaces: PlaceForMap[] = [];
  try {
    existingPlaces = await fetchAllPlaces();
  } catch (e) {
    console.warn("Failed to fetch existing places for validation", e);
    // אם לא הצלחנו להביא – לא חוסמים, ניתן לשרת לטפל
  }

  // 2) בדיקות כפילות בצד לקוח

  const duplicateErrors: string[] = [];

  // 🔹 כפילות במיקום גיאוגרפי (lat+lon)
  if (existingPlaces.length > 0) {
    const sameLocation = existingPlaces.find(
      (p) =>
        p.location &&
        p.location.lat === data.lat &&
        p.location.lon === data.lon
    );

    if (sameLocation) {
      duplicateErrors.push(
        `קיים כבר מקום עם אותו מיקום גאוגרפי (lat=${data.lat}, lon=${data.lon}) בשם: ${sameLocation.name}`
      );
    }

    // 🔹 כפילות בשם באנגלית
    if (
      data.name &&
      existingPlaces.some(
        (p) => p.name && p.name.trim() === String(data.name).trim()
      )
    ) {
      duplicateErrors.push("שם המקום באנגלית כבר קיים במערכת");
    }

    // 🔹 כפילות בשם בערבית
    if (
      data.name_ar &&
      existingPlaces.some(
        (p) =>
          p.name_ar &&
          p.name_ar.trim() === String(data.name_ar).trim()
      )
    ) {
      duplicateErrors.push("שם המקום בערבית כבר קיים במערכת");
    }

    // 🔹 כפילות בשם בעברית
    if (
      data.name_he &&
      existingPlaces.some(
        (p) =>
          p.name_he &&
          p.name_he.trim() === String(data.name_he).trim()
      )
    ) {
      duplicateErrors.push("שם המקום בעברית כבר קיים במערכת");
    }
  }

  // אם יש לפחות שגיאה אחת – נזרוק שגיאה מפורטת,
  // והיא תיתפס ב־catch במסך ותוצג ל־admin
  if (duplicateErrors.length > 0) {
    throw new Error(duplicateErrors.join("\n"));
  }

  // 3) פונקציה פנימית לעזרה – להוציא הודעת שגיאה אמיתית מהשרת
  async function buildErrorMessage(
    res: Response,
    defaultMessage: string
  ): Promise<string> {
    try {
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const body = await res.json();
        if (typeof body?.detail === "string") {
          return `${defaultMessage}: ${body.detail}`;
        }
        if (Array.isArray(body?.detail)) {
          // FastAPI לפעמים מחזיר מערך של שגיאות
          const msgs = body.detail
            .map((d: any) => d?.msg || "")
            .filter(Boolean);
          if (msgs.length > 0) {
            return `${defaultMessage}: ${msgs.join(", ")}`;
          }
        }
        // fallback – ננסה שדה אחר אם יש
        if (typeof body?.message === "string") {
          return `${defaultMessage}: ${body.message}`;
        }
      } else {
        const text = await res.text();
        if (text) return `${defaultMessage}: ${text}`;
      }
    } catch (e) {
      console.warn("Failed to parse error response", e);
    }
    return defaultMessage;
  }

  // 4) קודם יוצרים LOCATION
  const locRes = await fetch(`${BASE_URL}/locations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      lat: data.lat,
      lon: data.lon,
      source: data.source,
      osm_id: data.osm_id,
    }),
  });

  if (!locRes.ok) {
    const msg = await buildErrorMessage(
      locRes,
      "Failed to create location"
    );
    throw new Error(msg);
  }

  const location = await locRes.json();

  // 5) עכשיו יוצרים PLACE
  const computedCanBeClaimed =
    data.place_type === "BUSINESS" ? true : false;

  const placeRes = await fetch(`${BASE_URL}/places`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: data.name,
      name_ar: data.name_ar,
      name_he: data.name_he,
      place_type: data.place_type,
      city_id: data.city_id,
      category_id: data.category_id,
      can_be_claimed: computedCanBeClaimed,
      description: data.description,
      phone: data.phone,
      opening_hours: data.opening_hours,
      main_image_url: data.main_image_url,
      social_links: data.social_links,
      owner_user_id: data.owner_user_id,
      location_id: location.id,
      created_by_admin_id: data.created_by_admin_id,
    }),
  });

  if (!placeRes.ok) {
    const msg = await buildErrorMessage(
      placeRes,
      "Failed to create place"
    );
    throw new Error(msg);
  }

  return placeRes.json();
}

// =======================
// FETCH ALL PLACES (admin)
// =======================
// נשתמש בזה כדי להציג את כל המקומות על המפה במסך AdminHomeScreen
export async function fetchAllPlaces(): Promise<PlaceForMap[]> {
  const res = await fetch(`${BASE_URL}/admin/places`);
  if (!res.ok) throw new Error("Failed to fetch places");
  return res.json();
}

// =======================
// FETCH PLACES BY BBOX (for regular users)
// =======================
// Fetches places within visible map area (bounding box)
// =======================
// SAVED PLACES (BOOKMARKS)
// =======================

export async function savePlace(userId: number, placeId: number): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${BASE_URL}/places/${placeId}/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, place_id: placeId }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.detail || "Failed to save place");
  }
  return res.json();
}

export async function unsavePlace(userId: number, placeId: number): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${BASE_URL}/places/${placeId}/unsave?user_id=${userId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.detail || "Failed to unsave place");
  }
  return res.json();
}

export async function getSavedPlaces(userId: number): Promise<PlaceForMap[]> {
  const res = await fetch(`${BASE_URL}/users/${userId}/saved-places`);
  if (!res.ok) throw new Error("Failed to fetch saved places");
  return res.json();
}

export async function checkIfPlaceSaved(userId: number, placeId: number): Promise<boolean> {
  const res = await fetch(`${BASE_URL}/places/${placeId}/is-saved?user_id=${userId}`);
  if (!res.ok) return false;
  const data = await res.json();
  return data.is_saved || false;
}

export async function fetchPlacesByBbox(
  north: number,
  south: number,
  east: number,
  west: number
): Promise<PlaceForMap[]> {
  const params = new URLSearchParams({
    north: north.toString(),
    south: south.toString(),
    east: east.toString(),
    west: west.toString(),
  });
  const res = await fetch(`${BASE_URL}/places/map?${params}`);
  if (!res.ok) throw new Error("Failed to fetch places");
  return res.json();
}
// =======================
// GPS → OSM CHECK
// =======================
export async function checkOsmForGps(
  lat: number,
  lon: number
): Promise<GpsOsmCheckResult> {
  const res = await fetch(`${BASE_URL}/gps/osm-check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat, lon }),
  });

  if (!res.ok) {
    throw new Error("Failed to check OSM for GPS");
  }

  return res.json();
}

// =======================
// UPDATE PLACE
// =======================
export async function updatePlace(placeId: number, updateData: any): Promise<any> {
  const res = await fetch(`${BASE_URL}/admin/places/${placeId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updateData),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || "Failed to update place");
  }

  return res.json();
}

// =======================
// AI TRANSLATION
// =======================
export async function translateText(text: string, targetLanguage: "ar" | "he"): Promise<{ translated_text: string; detected_language: string }> {
  try {
    const res = await fetch(`${BASE_URL}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        target_language: targetLanguage,
      }),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      const errorMessage = error.detail || error.message || `HTTP ${res.status}: Failed to translate text`;
      console.error("Translation error:", errorMessage);
      throw new Error(errorMessage);
    }

    return res.json();
  } catch (error: any) {
    // Handle network errors
    if (error.message.includes("fetch") || error.message.includes("Network")) {
      throw new Error("Cannot connect to server. Please check if the backend is running.");
    }
    // Re-throw other errors with their original message
    throw error;
  }
}