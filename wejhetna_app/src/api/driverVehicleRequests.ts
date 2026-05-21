import axios from "axios";
import { API_BASE_URL } from "../../config";

export type VehicleUpdateRequestType = "UPDATE_EXISTING" | "ADD_NEW";
export type VehicleUpdateRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface DriverVehicleUpdateRequest {
  id: number;
  driver_user_id: number;
  driver_profile_id: number;
  request_type: VehicleUpdateRequestType;
  status: VehicleUpdateRequestStatus;
  car_type: string;
  plate_number: string;
  production_year: number;
  driver_license_image_url: string;
  id_card_image_url: string;
  car_license_image_url: string;
  car_insurance_image_url: string;
  car_photos_urls?: string[] | null;
  message_to_admin?: string | null;
  rejection_reason?: string | null;
  can_continue_driving?: boolean | null;
  created_at: string;
  reviewed_at?: string | null;
  driver_full_name?: string | null;
  driver_email?: string | null;
  driver_phone?: string | null;
}

export interface CreateVehicleUpdateRequestPayload {
  driver_user_id: number;
  request_type: VehicleUpdateRequestType;
  car_type: string;
  plate_number: string;
  production_year: number;
  driver_license_image_url: string;
  id_card_image_url: string;
  car_license_image_url: string;
  car_insurance_image_url: string;
  car_photos_urls?: string[];
  message_to_admin?: string;
}

export async function createVehicleUpdateRequest(
  payload: CreateVehicleUpdateRequestPayload
): Promise<DriverVehicleUpdateRequest> {
  const res = await axios.post(
    `${API_BASE_URL}/drivers/vehicle-update-requests`,
    payload
  );
  return res.data;
}

export async function listDriverVehicleUpdateRequests(
  driverUserId: number
): Promise<DriverVehicleUpdateRequest[]> {
  const res = await axios.get(
    `${API_BASE_URL}/drivers/${driverUserId}/vehicle-update-requests`
  );
  return res.data;
}

export async function getVehicleUpdateRequest(
  requestId: number
): Promise<DriverVehicleUpdateRequest> {
  const res = await axios.get(
    `${API_BASE_URL}/drivers/vehicle-update-requests/${requestId}`
  );
  return res.data;
}

export async function listPendingVehicleUpdateRequests(): Promise<
  DriverVehicleUpdateRequest[]
> {
  const res = await axios.get(
    `${API_BASE_URL}/admin/drivers/vehicle-update-requests/pending`
  );
  return res.data;
}

export async function approveVehicleUpdateRequest(
  requestId: number,
  adminUserId: number
): Promise<void> {
  await axios.post(
    `${API_BASE_URL}/admin/drivers/vehicle-update-requests/${requestId}/approve`,
    { admin_user_id: adminUserId }
  );
}

export async function rejectVehicleUpdateRequest(
  requestId: number,
  adminUserId: number,
  rejectionReason: string,
  canContinueDriving: boolean,
  driverLanguage?: string
): Promise<void> {
  await axios.post(
    `${API_BASE_URL}/admin/drivers/vehicle-update-requests/${requestId}/reject`,
    {
      admin_user_id: adminUserId,
      rejection_reason: rejectionReason,
      can_continue_driving: canContinueDriving,
      driver_language: driverLanguage,
    }
  );
}
