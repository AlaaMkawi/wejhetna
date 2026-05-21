// src/api/profileApi.ts
import axios from "axios";
import { API_BASE_URL } from "../../config";

// ---------- Types ----------
export interface UserProfile {
  id: number;
  full_name: string;
  username: string;
  email: string;
  phone: string;
  role: "REGULAR" | "DRIVER" | "BUSINESS_OWNER" | "ADMIN";
  status: string;
  created_at?: string;
}

export interface DriverVehicleInfo {
  id: number;
  car_type: string;
  plate_number: string;
  production_year: number;
  car_license_image_url: string;
  car_insurance_image_url: string;
  car_photos_urls?: string[];
  status: string;
}

export interface DriverProfileInfo {
  user: UserProfile;
  vehicle?: DriverVehicleInfo;
  driver_status: string;
  driver_license_image_url?: string;
  id_card_image_url?: string;
  vehicle_update_blocked?: boolean;
  has_pending_vehicle_request?: boolean;
}

export interface BusinessPlaceInfo {
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
  lat?: number;
  lon?: number;
}

export interface BusinessOwnerProfileInfo {
  user: UserProfile;
  place?: BusinessPlaceInfo;
  request_status?: string;
}

// ---------- API calls ----------

// Get user profile by ID
export async function getUserProfile(userId: number): Promise<UserProfile> {
  const res = await axios.get(`${API_BASE_URL}/users/${userId}`);
  return res.data;
}

// Get driver profile with vehicle info
export async function getDriverProfile(
  userId: number
): Promise<DriverProfileInfo> {
  const res = await axios.get(`${API_BASE_URL}/users/${userId}/driver-profile`);
  return res.data;
}

// Get business owner profile with place info
export async function getBusinessOwnerProfile(
  userId: number
): Promise<BusinessOwnerProfileInfo> {
  const res = await axios.get(
    `${API_BASE_URL}/users/${userId}/business-owner-profile`
  );
  return res.data;
}

