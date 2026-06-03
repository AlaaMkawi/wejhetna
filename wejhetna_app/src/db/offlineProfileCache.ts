import type {
  BusinessOwnerProfileInfo,
  DriverProfileInfo,
  UserProfile,
} from "../api/profileApi";
import { kvGet, kvSet } from "./offlineKv";

export type ProfileCacheEntry = {
  user: UserProfile;
  driver: DriverProfileInfo | null;
  business: BusinessOwnerProfileInfo | null;
};

function cacheKey(userId: number): string {
  return `profile_cache:${userId}`;
}

export function saveProfileCache(userId: number, entry: ProfileCacheEntry): void {
  try {
    kvSet(cacheKey(userId), JSON.stringify(entry));
  } catch {
    // best-effort offline mirror
  }
}

export function loadProfileCache(userId: number): ProfileCacheEntry | null {
  try {
    const raw = kvGet(cacheKey(userId));
    if (!raw) return null;
    return JSON.parse(raw) as ProfileCacheEntry;
  } catch {
    return null;
  }
}
