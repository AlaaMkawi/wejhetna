/**
 * Session restore: read persisted auth keys from AsyncStorage, optionally
 * validate against the backend, and decide where to send the user on cold
 * start (Home / UserTabs / AdminTabs).
 *
 * Extracted from `SessionRestoreScreen` so the decision logic can be unit
 * tested without rendering the screen and the navigation container.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { parseStoredUserId } from "../api/rides";
import { getUserProfile } from "../api/profileApi";

export const AUTH_STORAGE_KEYS = ["userId", "userRole"] as const;

export type SessionRestoreOutcome =
  | { kind: "go_home" }
  | { kind: "go_user_tabs"; userId: number; role: string }
  | { kind: "go_admin_tabs"; userId: number };

/**
 * Source-of-truth for cold-start session restoration.
 *
 * Behavior (matches the historical `SessionRestoreScreen` implementation):
 *  - Missing/garbage `userId` or empty `userRole` → clear keys, go Home.
 *  - Server returns 401/404 → user is gone or unauthorized → clear keys, go Home.
 *  - Server returns a non-ACTIVE status → suspended/banned → clear keys, go Home.
 *  - Server returns ACTIVE with a different role → adopt the server role and
 *    persist it, then continue.
 *  - Network/server error (anything except the explicit invalidation cases) →
 *    keep the local session so offline users are not kicked out.
 *  - Final destination depends on the effective role: ADMIN → AdminTabs,
 *    everyone else → UserTabs.
 *
 * Note: this function never dispatches navigation itself — the caller does.
 * It also does not call `notifyUserLoggedIn` / `notifyUserLoggedOut`; the
 * caller wires those side effects to keep the helper pure.
 */
export async function resolveSessionRestore(): Promise<SessionRestoreOutcome> {
  const clearKeys = async () => {
    try {
      await AsyncStorage.multiRemove([...AUTH_STORAGE_KEYS]);
    } catch {
      // best-effort; even if storage clear fails the in-memory session resets
    }
  };

  let rawId: string | null = null;
  let roleRaw: string | null = null;
  try {
    [rawId, roleRaw] = await Promise.all([
      AsyncStorage.getItem("userId"),
      AsyncStorage.getItem("userRole"),
    ]);
  } catch {
    await clearKeys();
    return { kind: "go_home" };
  }

  const userId = parseStoredUserId(rawId);
  const role = roleRaw?.trim() || null;

  if (userId == null || !role) {
    await clearKeys();
    return { kind: "go_home" };
  }

  let effectiveRole = role;

  try {
    const profile = await getUserProfile(userId);
    if (profile.status && profile.status !== "ACTIVE") {
      await clearKeys();
      return { kind: "go_home" };
    }
    if (profile.role) {
      effectiveRole = profile.role;
      if (profile.role !== role) {
        try {
          await AsyncStorage.setItem("userRole", profile.role);
        } catch {
          // non-fatal: we continue with the in-memory updated role
        }
      }
    }
  } catch (e) {
    if (
      axios.isAxiosError(e) &&
      (e.response?.status === 404 || e.response?.status === 401)
    ) {
      await clearKeys();
      return { kind: "go_home" };
    }
    // other errors: keep local session
  }

  if (effectiveRole === "ADMIN") {
    return { kind: "go_admin_tabs", userId };
  }
  return { kind: "go_user_tabs", userId, role: effectiveRole };
}
