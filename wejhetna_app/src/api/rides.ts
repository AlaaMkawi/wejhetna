import { API_BASE_URL as BASE_URL } from "../../config";

/**
 * AsyncStorage sometimes holds garbage ("null", "", non-digits). parseInt → NaN →
 * JSON.stringify drops numbers as null and URLs become /drivers/NaN/… → FastAPI 422.
 */
export function parseStoredUserId(raw: string | null | undefined): number | null {
  if (raw == null) {
    return null;
  }
  const s = String(raw).trim();
  if (s === "" || s === "null" || s === "undefined") {
    return null;
  }
  const n = parseInt(s, 10);
  if (!Number.isFinite(n) || n < 1 || n > 2147483647) {
    return null;
  }
  return n;
}

/** ngrok-free and similar tunnels often return HTML unless this header is set. */
const RIDE_FETCH_HEADERS: Record<string, string> = {
  Accept: "application/json",
  "Content-Type": "application/json",
  "ngrok-skip-browser-warning": "true",
};

export type NearbyDriver = {
  driver_user_id: number;
  full_name: string;
  username: string;
  lat: number;
  lon: number;
  distance_km: number;
};

export type RideRequestStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "cancelled"
  | "on_the_way"
  | "driving_to_customer"
  | "arrived"
  | "in_progress"
  | "completed";

const RIDE_STATUS_VALUES: readonly RideRequestStatus[] = [
  "pending",
  "accepted",
  "rejected",
  "cancelled",
  "on_the_way",
  "driving_to_customer",
  "arrived",
  "in_progress",
  "completed",
];

/** Backend/DB may emit enum names or mixed casing; UI compares to lowercase literals. */
export function normalizeRideRequestStatus(raw: unknown): RideRequestStatus {
  const s = String(raw ?? "").trim();
  if (!s) {
    return "pending";
  }
  const lower = s.toLowerCase();
  if ((RIDE_STATUS_VALUES as readonly string[]).includes(lower)) {
    return lower as RideRequestStatus;
  }
  const upper = s.toUpperCase().replace(/-/g, "_");
  const byEnumName: Record<string, RideRequestStatus> = {
    PENDING: "pending",
    ACCEPTED: "accepted",
    REJECTED: "rejected",
    CANCELLED: "cancelled",
    ON_THE_WAY: "on_the_way",
    DRIVING_TO_CUSTOMER: "driving_to_customer",
    ARRIVED: "arrived",
    IN_PROGRESS: "in_progress",
    COMPLETED: "completed",
  };
  return byEnumName[upper] ?? "pending";
}

/** User cannot create a new ride while status is any of these (until rejected/cancelled/completed). */
export function isActiveBlockingRideStatus(status: RideRequestStatus | string | null | undefined): boolean {
  if (status == null || status === "") {
    return false;
  }
  const s = typeof status === "string" ? normalizeRideRequestStatus(status) : status;
  return s !== "rejected" && s !== "cancelled" && s !== "completed";
}

export type DriverRideRequest = {
  id: number;
  regular_user_id: number;
  regular_username: string;
  /** Passenger display name (same source as User.full_name); optional for older API responses. */
  regular_full_name?: string | null;
  driver_phone?: string | null;
  pickup_lat: number;
  pickup_lon: number;
  destination_text: string;
  destination_lat?: number | null;
  destination_lon?: number | null;
  passengers_count: number;
  number_of_people?: number | null;
  number_of_seats_required?: number | null;
  status: RideRequestStatus;
  distance_to_pickup_km?: number | null;
  eta_to_pickup_min?: number | null;
  eta_to_user?: number | null;
  estimated_trip_time?: number | null;
  regular_phone?: string | null;
  passenger_verification_unlocked?: boolean;
  verification_failed_attempts?: number;
  status_note?: string | null;
  created_at: string;
  updated_at: string;
};

export type RegularLatestRideRequest = {
  id: number;
  driver_user_id: number;
  driver_full_name: string;
  driver_username: string;
  driver_phone?: string | null;
  pickup_lat?: number;
  pickup_lon?: number;
  destination_text: string;
  destination_lat?: number | null;
  destination_lon?: number | null;
  passengers_count: number;
  number_of_people?: number | null;
  number_of_seats_required?: number | null;
  estimated_trip_time?: number | null;
  /** Minutes until driver reaches you (updates while driver is on the way). */
  eta_to_user?: number | null;
  /** Driver’s live position to your pickup (km), when the server has a recent driver location. */
  distance_to_pickup_km?: number | null;
  driver_live_lat?: number | null;
  driver_live_lon?: number | null;
  status: RideRequestStatus;
  /** When true, passenger may see the verification code (after driver confirms passenger is outside). */
  passenger_verification_unlocked?: boolean;
  /** Present when driver marked arrival and passenger unlock is on; passenger shares with driver to start the ride. */
  verification_code?: string | null;
  verification_failed_attempts?: number;
  regular_phone?: string | null;
  status_note?: string | null;
  created_at: string;
  updated_at: string;
};

function parseFastApiDetail(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  const d = (payload as { detail?: unknown }).detail;
  if (typeof d === "string") {
    return d;
  }
  if (Array.isArray(d)) {
    return d
      .map((item) => {
        if (item && typeof item === "object" && "msg" in item) {
          return String((item as { msg?: string }).msg ?? "");
        }
        return String(item);
      })
      .filter(Boolean)
      .join("; ");
  }
  return "";
}

function userFacingRideDetail(detail: string, fallback: string): string {
  const t = detail.trim();
  if (!t) {
    return fallback;
  }
  if (t.length > 280 || /DETAIL:|LINE \d+:|sqlalchemy|postgresql|syntax error/i.test(t)) {
    return fallback;
  }
  return t;
}

async function parseOrThrow(res: Response, fallbackMessage: string) {
  if (!res.ok) {
    const ct = res.headers.get("content-type") ?? "";
    let raw: unknown = {};
    if (ct.includes("application/json")) {
      raw = await res.json().catch(() => ({}));
    } else {
      await res.text().catch(() => "");
      throw new Error(`${fallbackMessage} (HTTP ${res.status})`);
    }
    const detail = userFacingRideDetail(parseFastApiDetail(raw) || fallbackMessage, fallbackMessage);
    throw new Error(detail);
  }
  return res.json();
}

/** Map FastAPI `detail` strings to i18n keys (see ar.json / he.json). */
export function rideApiDetailToTranslationKey(detail: string): string | null {
  const d = detail.trim();
  const map: Record<string, string> = {
    "Driver is not available": "ride_error_driver_unavailable",
    "Regular user not found": "ride_error_regular_not_found",
    "Driver not found": "ride_error_driver_not_found",
    "Location is required when enabling availability": "ride_location_required_for_availability",
    "number_of_people and number_of_seats_required are required": "ride_error_passenger_fields",
    "number_of_people and number_of_seats_required must be positive": "ride_error_passenger_fields",
    "Could not save ride request": "ride_failed_create_request",
    "Invalid ride request": "ride_failed_create_request",
    "Verification code expired": "ride_error_verify_expired",
    "Invalid verification code": "ride_error_verify_invalid",
    "Ride is not waiting for verification code": "ride_error_not_waiting_code",
    "Only on-the-way rides can be marked arrived": "ride_error_mark_arrived_invalid_state",
    "Active ride request already exists": "ride_error_active_ride_exists",
    "Ride request is already closed": "ride_error_ride_already_closed",
    "Ride cannot be cancelled in this state": "ride_error_cancel_invalid_state",
    "Passenger is not allowed to cancel this request": "ride_error_passenger_cancel_forbidden",
    "Verification attempts exceeded; ride cancelled": "ride_error_verify_attempts_exceeded",
    "Ride is not waiting for verification unlock": "ride_error_verify_unlock_wrong_state",
  };
  return map[d] ?? null;
}

export async function updateDriverAvailability(payload: {
  driver_user_id: number;
  is_available: boolean;
  lat?: number;
  lon?: number;
}) {
  const did = Math.trunc(Number(payload.driver_user_id));
  if (!Number.isFinite(did) || did < 1) {
    throw new Error("Invalid ride request");
  }
  const res = await fetch(`${BASE_URL}/drivers/availability`, {
    method: "PUT",
    headers: RIDE_FETCH_HEADERS,
    body: JSON.stringify({ ...payload, driver_user_id: did }),
  });
  return parseOrThrow(res, "Failed to update availability");
}

export async function getDriverAvailability(driver_user_id: number): Promise<{ is_available: boolean }> {
  const id = Math.trunc(Number(driver_user_id));
  if (!Number.isFinite(id) || id < 1) {
    throw new Error("Invalid ride request");
  }
  const res = await fetch(`${BASE_URL}/drivers/${id}/availability`, {
    headers: RIDE_FETCH_HEADERS,
  });
  return parseOrThrow(res, "Failed to load availability");
}

export async function updateDriverLocation(payload: {
  driver_user_id: number;
  lat: number;
  lon: number;
}) {
  const did = Math.trunc(Number(payload.driver_user_id));
  const lat = Number(payload.lat);
  const lon = Number(payload.lon);
  if (!Number.isFinite(did) || did < 1 || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error("Invalid ride request");
  }
  const res = await fetch(`${BASE_URL}/drivers/location`, {
    method: "POST",
    headers: RIDE_FETCH_HEADERS,
    body: JSON.stringify({ driver_user_id: did, lat, lon }),
  });
  return parseOrThrow(res, "Failed to update driver location");
}

export async function getNearbyDrivers(payload: {
  regular_user_id: number;
  lat: number;
  lon: number;
  radius_m?: number;
}): Promise<NearbyDriver[]> {
  const rid = Math.trunc(Number(payload.regular_user_id));
  const lat = Number(payload.lat);
  const lon = Number(payload.lon);
  if (!Number.isFinite(rid) || rid < 1 || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error("Invalid ride request");
  }
  const params = new URLSearchParams({
    regular_user_id: String(rid),
    lat: String(lat),
    lon: String(lon),
    radius_m: String(payload.radius_m ?? 3000),
  });
  const res = await fetch(`${BASE_URL}/rides/nearby-drivers?${params.toString()}`, {
    headers: RIDE_FETCH_HEADERS,
  });
  return parseOrThrow(res, "Failed to load nearby drivers");
}

export async function createRideRequest(payload: {
  regular_user_id: number;
  driver_user_id: number;
  pickup_lat: number;
  pickup_lon: number;
  destination_text: string;
  destination_lat?: number;
  destination_lon?: number;
  regular_phone: string;
  passengers_count?: number;
  number_of_people: number;
  number_of_seats_required: number;
}) {
  const regular_user_id = Math.trunc(Number(payload.regular_user_id));
  const driver_user_id = Math.trunc(Number(payload.driver_user_id));
  const pickup_lat = Number(payload.pickup_lat);
  const pickup_lon = Number(payload.pickup_lon);
  const number_of_people = Math.trunc(Number(payload.number_of_people));
  const number_of_seats_required = Math.trunc(Number(payload.number_of_seats_required));
  if (
    !Number.isFinite(regular_user_id) ||
    regular_user_id < 1 ||
    !Number.isFinite(driver_user_id) ||
    driver_user_id < 1 ||
    !Number.isFinite(pickup_lat) ||
    !Number.isFinite(pickup_lon) ||
    !Number.isFinite(number_of_people) ||
    number_of_people < 1 ||
    !Number.isFinite(number_of_seats_required) ||
    number_of_seats_required < 1
  ) {
    throw new Error("Invalid ride request");
  }
  const passengers_trunc =
    payload.passengers_count == null ? undefined : Math.trunc(Number(payload.passengers_count));
  if (
    passengers_trunc != null &&
    (!Number.isFinite(passengers_trunc) || passengers_trunc < 1)
  ) {
    throw new Error("Invalid ride request");
  }
  const body = {
    ...payload,
    regular_user_id,
    driver_user_id,
    pickup_lat,
    pickup_lon,
    destination_lat:
      payload.destination_lat == null || !Number.isFinite(Number(payload.destination_lat))
        ? undefined
        : Number(payload.destination_lat),
    destination_lon:
      payload.destination_lon == null || !Number.isFinite(Number(payload.destination_lon))
        ? undefined
        : Number(payload.destination_lon),
    number_of_people,
    number_of_seats_required,
    passengers_count: passengers_trunc,
  };
  const res = await fetch(`${BASE_URL}/rides/requests`, {
    method: "POST",
    headers: RIDE_FETCH_HEADERS,
    body: JSON.stringify(body),
  });
  return parseOrThrow(res, "Failed to create ride request");
}

export async function getDriverRideRequests(driver_user_id: number): Promise<DriverRideRequest[]> {
  const id = Math.trunc(Number(driver_user_id));
  if (!Number.isFinite(id) || id < 1) {
    throw new Error("Invalid ride request");
  }
  const res = await fetch(`${BASE_URL}/drivers/${id}/ride-requests`, {
    headers: RIDE_FETCH_HEADERS,
  });
  const data = (await parseOrThrow(res, "Failed to load driver requests")) as DriverRideRequest[];
  if (!Array.isArray(data)) {
    return [];
  }
  return data.map((row) => ({
    ...row,
    status: normalizeRideRequestStatus(row.status),
    passenger_verification_unlocked: Boolean(row.passenger_verification_unlocked),
    verification_failed_attempts:
      typeof row.verification_failed_attempts === "number" ? row.verification_failed_attempts : 0,
  }));
}

export async function acceptRideRequest(ride_request_id: number, driver_user_id: number) {
  const rid = Math.trunc(Number(ride_request_id));
  const did = Math.trunc(Number(driver_user_id));
  if (!Number.isFinite(rid) || rid < 1 || !Number.isFinite(did) || did < 1) {
    throw new Error("Invalid ride request");
  }
  const res = await fetch(`${BASE_URL}/rides/requests/${rid}/accept`, {
    method: "POST",
    headers: RIDE_FETCH_HEADERS,
    body: JSON.stringify({ driver_user_id: did }),
  });
  return parseOrThrow(res, "Failed to accept request");
}

export async function rejectRideRequest(ride_request_id: number, driver_user_id: number) {
  const rid = Math.trunc(Number(ride_request_id));
  const did = Math.trunc(Number(driver_user_id));
  if (!Number.isFinite(rid) || rid < 1 || !Number.isFinite(did) || did < 1) {
    throw new Error("Invalid ride request");
  }
  const res = await fetch(`${BASE_URL}/rides/requests/${rid}/reject`, {
    method: "POST",
    headers: RIDE_FETCH_HEADERS,
    body: JSON.stringify({ driver_user_id: did }),
  });
  return parseOrThrow(res, "Failed to reject request");
}

export async function cancelRideRequest(ride_request_id: number, driver_user_id: number) {
  const rid = Math.trunc(Number(ride_request_id));
  const did = Math.trunc(Number(driver_user_id));
  if (!Number.isFinite(rid) || rid < 1 || !Number.isFinite(did) || did < 1) {
    throw new Error("Invalid ride request");
  }
  const res = await fetch(`${BASE_URL}/rides/requests/${rid}/cancel`, {
    method: "POST",
    headers: RIDE_FETCH_HEADERS,
    body: JSON.stringify({ driver_user_id: did }),
  });
  return parseOrThrow(res, "Failed to cancel request");
}

export async function cancelRideRequestByPassenger(payload: {
  ride_request_id: number;
  regular_user_id: number;
  note?: string;
}) {
  const ride_request_id = Math.trunc(Number(payload.ride_request_id));
  const regular_user_id = Math.trunc(Number(payload.regular_user_id));
  if (!Number.isFinite(ride_request_id) || ride_request_id < 1 || !Number.isFinite(regular_user_id) || regular_user_id < 1) {
    throw new Error("Invalid ride request");
  }
  const res = await fetch(`${BASE_URL}/rides/requests/${ride_request_id}/cancel-by-passenger`, {
    method: "POST",
    headers: RIDE_FETCH_HEADERS,
    body: JSON.stringify({
      regular_user_id,
      note: payload.note,
    }),
  });
  return parseOrThrow(res, "Failed to cancel request");
}

export async function startDrivingToCustomer(ride_request_id: number, driver_user_id: number) {
  const rid = Math.trunc(Number(ride_request_id));
  const did = Math.trunc(Number(driver_user_id));
  if (!Number.isFinite(rid) || rid < 1 || !Number.isFinite(did) || did < 1) {
    throw new Error("Invalid ride request");
  }
  const res = await fetch(`${BASE_URL}/rides/requests/${rid}/start-driving`, {
    method: "POST",
    headers: RIDE_FETCH_HEADERS,
    body: JSON.stringify({ driver_user_id: did }),
  });
  return parseOrThrow(res, "Failed to start driving");
}

export async function markRideArrived(ride_request_id: number, driver_user_id: number) {
  const rid = Math.trunc(Number(ride_request_id));
  const did = Math.trunc(Number(driver_user_id));
  if (!Number.isFinite(rid) || rid < 1 || !Number.isFinite(did) || did < 1) {
    throw new Error("Invalid ride request");
  }
  const res = await fetch(`${BASE_URL}/rides/requests/${rid}/arrived`, {
    method: "POST",
    headers: RIDE_FETCH_HEADERS,
    body: JSON.stringify({ driver_user_id: did }),
  });
  return parseOrThrow(res, "Failed to mark arrived");
}

export async function unlockPassengerVerificationForRide(ride_request_id: number, driver_user_id: number) {
  const rid = Math.trunc(Number(ride_request_id));
  const did = Math.trunc(Number(driver_user_id));
  if (!Number.isFinite(rid) || rid < 1 || !Number.isFinite(did) || did < 1) {
    throw new Error("Invalid ride request");
  }
  const res = await fetch(`${BASE_URL}/rides/requests/${rid}/unlock-passenger-verification`, {
    method: "POST",
    headers: RIDE_FETCH_HEADERS,
    body: JSON.stringify({ driver_user_id: did }),
  });
  return parseOrThrow(res, "Failed to unlock passenger verification");
}

export async function verifyRideStartCode(payload: {
  ride_request_id: number;
  verification_code: string;
  driver_user_id?: number;
  regular_user_id?: number;
}) {
  const ride_request_id = Math.trunc(Number(payload.ride_request_id));
  const verification_code = String(payload.verification_code ?? "").trim();
  if (!Number.isFinite(ride_request_id) || ride_request_id < 1 || verification_code.length < 4) {
    throw new Error("Invalid ride request");
  }
  const body: Record<string, unknown> = {
    ride_request_id,
    verification_code,
  };
  if (payload.regular_user_id != null) {
    const uid = Math.trunc(Number(payload.regular_user_id));
    if (!Number.isFinite(uid) || uid < 1) {
      throw new Error("Invalid ride request");
    }
    body.regular_user_id = uid;
  } else if (payload.driver_user_id != null) {
    const did = Math.trunc(Number(payload.driver_user_id));
    if (!Number.isFinite(did) || did < 1) {
      throw new Error("Invalid ride request");
    }
    body.driver_user_id = did;
  } else {
    throw new Error("Invalid ride request");
  }
  const res = await fetch(`${BASE_URL}/rides/verify-code`, {
    method: "POST",
    headers: RIDE_FETCH_HEADERS,
    body: JSON.stringify(body),
  });
  return parseOrThrow(res, "Failed to verify code");
}

export async function completeRideTrip(payload: {
  ride_request_id: number;
  driver_user_id?: number;
  regular_user_id?: number;
}) {
  const ride_request_id = Math.trunc(Number(payload.ride_request_id));
  if (!Number.isFinite(ride_request_id) || ride_request_id < 1) {
    throw new Error("Invalid ride request");
  }
  const body: Record<string, unknown> = { ride_request_id };
  if (payload.driver_user_id != null && payload.regular_user_id != null) {
    throw new Error("Invalid ride request");
  }
  if (payload.driver_user_id != null) {
    const did = Math.trunc(Number(payload.driver_user_id));
    if (!Number.isFinite(did) || did < 1) {
      throw new Error("Invalid ride request");
    }
    body.driver_user_id = did;
  } else if (payload.regular_user_id != null) {
    const uid = Math.trunc(Number(payload.regular_user_id));
    if (!Number.isFinite(uid) || uid < 1) {
      throw new Error("Invalid ride request");
    }
    body.regular_user_id = uid;
  } else {
    throw new Error("Invalid ride request");
  }
  const res = await fetch(`${BASE_URL}/rides/requests/${ride_request_id}/complete`, {
    method: "POST",
    headers: RIDE_FETCH_HEADERS,
    body: JSON.stringify(body),
  });
  return parseOrThrow(res, "Failed to complete ride");
}

export async function getRegularLatestRideRequest(
  user_id: number
): Promise<RegularLatestRideRequest | null> {
  const uid = Math.trunc(Number(user_id));
  if (!Number.isFinite(uid) || uid < 1) {
    throw new Error("Invalid ride request");
  }
  const res = await fetch(`${BASE_URL}/users/${uid}/ride-requests/latest`, {
    headers: RIDE_FETCH_HEADERS,
  });
  if (res.status === 404) {
    throw new Error("Regular user not found");
  }
  const data = (await parseOrThrow(res, "Failed to load ride request status")) as RegularLatestRideRequest | null;
  if (data == null || typeof data !== "object") {
    return null;
  }
  const row = data as Record<string, unknown>;
  return {
    ...data,
    status: normalizeRideRequestStatus(data.status),
    passenger_verification_unlocked: Boolean((data as { passenger_verification_unlocked?: boolean }).passenger_verification_unlocked),
    verification_failed_attempts:
      typeof row.verification_failed_attempts === "number" ? row.verification_failed_attempts : 0,
    driver_phone: typeof row.driver_phone === "string" ? row.driver_phone : null,
    destination_lat: typeof row.destination_lat === "number" ? row.destination_lat : null,
    destination_lon: typeof row.destination_lon === "number" ? row.destination_lon : null,
    regular_phone: typeof row.regular_phone === "string" ? row.regular_phone : null,
    status_note: typeof row.status_note === "string" ? row.status_note : null,
  };
}

/** All ride requests for the passenger, newest first (same shape as latest row). */
export async function getRegularRideRequestsList(user_id: number): Promise<RegularLatestRideRequest[]> {
  const uid = Math.trunc(Number(user_id));
  if (!Number.isFinite(uid) || uid < 1) {
    throw new Error("Invalid ride request");
  }
  const res = await fetch(`${BASE_URL}/users/${uid}/ride-requests`, {
    headers: RIDE_FETCH_HEADERS,
  });
  if (res.status === 404) {
    throw new Error("Regular user not found");
  }
  const data = (await parseOrThrow(res, "Failed to load ride requests")) as RegularLatestRideRequest[];
  if (!Array.isArray(data)) {
    return [];
  }
  return data.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      ...row,
      status: normalizeRideRequestStatus(row.status),
      passenger_verification_unlocked: Boolean((row as { passenger_verification_unlocked?: boolean }).passenger_verification_unlocked),
      verification_failed_attempts:
        typeof r.verification_failed_attempts === "number" ? r.verification_failed_attempts : 0,
      driver_phone: typeof r.driver_phone === "string" ? r.driver_phone : null,
      destination_lat: typeof r.destination_lat === "number" ? r.destination_lat : null,
      destination_lon: typeof r.destination_lon === "number" ? r.destination_lon : null,
      regular_phone: typeof r.regular_phone === "string" ? r.regular_phone : null,
      status_note: typeof r.status_note === "string" ? r.status_note : null,
    };
  });
}
