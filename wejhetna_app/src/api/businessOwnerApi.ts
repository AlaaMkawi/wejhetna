// src/api/businessOwnerApi.ts
import axios from "axios";

const API_BASE_URL = "http://10.0.2.2:8000"; // backend base URL for emulator

// ---------- Types ----------
export type LoginRole = "REGULAR" | "DRIVER" | "BUSINESS_OWNER" | "ADMIN";

export interface BusinessOwnerSignupPayload {
  full_name: string;
  username: string;
  email: string;
  phone: string;
  password: string;
}

export interface UserOut {
  id: number;
  full_name: string;
  username: string;
  email: string;
  phone: string;
  role: LoginRole;
  status: string; // "PENDING" | "ACTIVE" | "REJECTED"
}

export interface BusinessOwnerSignupResponse {
  user: UserOut;
  message?: string;
}

export interface NearbyPlaceInfo {
  place_id: number;
  name: string;
  name_ar?: string;
  name_he?: string;
  city_name_ar?: string;
  has_owner: boolean;
}

export type NearbyStatus = "NO_PLACE" | "CAN_CLAIM" | "HAS_OWNER";

export interface BusinessOwnerNearbyCheckResponse {
  status: NearbyStatus;
  candidate?: NearbyPlaceInfo | null;
}

export interface BusinessOwnerPlaceRequestPayload {
  // Personal info to create user (if user doesn't exist yet)
  full_name: string;
  username: string;
  email: string;
  phone: string; // User's personal phone
  password: string;
  // Business and location info
  existing_place_id?: number | null;
  lat: number;
  lon: number;
  source: string; // "MAP_PICK" / "GPS_NO_OSM"
  osm_id?: string | null;
  name: string;
  name_ar: string;
  name_he: string;
  city_id: number;
  category_id: number;
  description?: string | null;
  business_phone?: string | null; // Business phone (different from user's personal phone)
  opening_hours?: string | null;
  main_image_url?: string | null;
  social_links?: string | null;
}

// ---------- API calls ----------

// 1) Signup as business owner
export async function signupBusinessOwner(
  payload: BusinessOwnerSignupPayload
): Promise<BusinessOwnerSignupResponse> {
  const res = await axios.post(
    `${API_BASE_URL}/auth/signup/business-owner`,
    payload
  );
  return res.data;
}

// 2) Check nearby places for owner
export async function checkNearbyForOwner(
  lat: number,
  lon: number,
  radius_m = 50
): Promise<BusinessOwnerNearbyCheckResponse> {
  const res = await axios.get(
    `${API_BASE_URL}/business-owner/places/nearby`,
    {
      params: { lat, lon, radius_m },
    }
  );
  return res.data;
}

// 3) Create business owner place request
export async function createBusinessOwnerPlaceRequest(
  payload: BusinessOwnerPlaceRequestPayload
) {
  const res = await axios.post(
    `${API_BASE_URL}/business-owner/place-requests`,
    payload
  );
  return res.data;
}

// 4) Get business owner profile with place data
export interface BusinessPlaceOut {
  id: number;
  name: string;
  name_ar?: string;
  name_he?: string;
  city_name?: string;
  category_name?: string;
  description?: string;
  phone?: string;
  opening_hours?: string;
  main_image_url?: string;
  business_images_urls?: string[];
  lat?: number;
  lon?: number;
  social_links?: string;
  announcement?: string;
}

export interface BusinessOwnerProfileOut {
  user: UserOut;
  place: BusinessPlaceOut | null;
  request_status: string | null;
}

export async function getBusinessOwnerProfile(
  userId: number
): Promise<BusinessOwnerProfileOut> {
  const res = await axios.get(
    `${API_BASE_URL}/users/${userId}/business-owner-profile`
  );
  return res.data;
}