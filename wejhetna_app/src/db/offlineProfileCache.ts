import type {
  BusinessOwnerProfileInfo,
  DriverProfileInfo,
  UserProfile,
} from "../api/profileApi";
import { kvGet, kvSet, kvDelete } from "./offlineKv";

export interface ProfileCachePayloadV1 {
  version: 1;
  user: UserProfile;
  driver?: DriverProfileInfo | null;
  business?: BusinessOwnerProfileInfo | null;
  cachedAt: number;
}

function keyForUser(userId: number): string {
  return `profile_cache_v1_${userId}`;
}

export function saveProfileCache(userId: number, payload: Omit<ProfileCachePayloadV1, "version" | "cachedAt">): void {
  try {
    const body: ProfileCachePayloadV1 = {
      version: 1,
      cachedAt: Date.now(),
      user: payload.user,
      driver: payload.driver,
      business: payload.business,
    };
    kvSet(keyForUser(userId), JSON.stringify(body));
  } catch (e) {
    console.warn("[offline] saveProfileCache failed", e);
  }
}

export function loadProfileCache(userId: number): ProfileCachePayloadV1 | null {
  try {
    const raw = kvGet(keyForUser(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ProfileCachePayloadV1;
    if (parsed?.version !== 1 || !parsed.user) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearProfileCacheForUser(userId: number): void {
  try {
    kvDelete(keyForUser(userId));
  } catch (e) {
    console.warn("[offline] clearProfileCacheForUser failed", e);
  }
}
