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
  place_type: PlaceType;

  can_be_claimed: boolean;
  description?: string | null;
  phone?: string | null;
  opening_hours?: string | null;
  main_image_url?: string | null;
  social_links?: string | null;

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
  // data מכיל:
  // name, place_type, city_id, category_id, lat, lon, source...

  // קודם יוצרים LOCATION
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

  if (!locRes.ok) throw new Error("Failed to create location");
  const location = await locRes.json();

  // עכשיו יוצרים PLACE
  const placeRes = await fetch(`${BASE_URL}/places`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: data.name,
      place_type: data.place_type,
      city_id: data.city_id,
      category_id: data.category_id,
      can_be_claimed: data.can_be_claimed,
      description: data.description,
      phone: data.phone,
      opening_hours: data.opening_hours,
      main_image_url: data.main_image_url,
      social_links: data.social_links,
      owner_user_id: data.owner_user_id,
      location_id: location.id,
    }),
  });

  if (!placeRes.ok) throw new Error("Failed to create place");
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
