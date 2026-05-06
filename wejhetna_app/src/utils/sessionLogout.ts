/**
 * Logout side effects shared by every screen that signs the user out.
 *
 * Keeps a single, easy-to-audit place for clearing both the in-memory
 * session marker (`notifyUserLoggedOut`) and persistent storage. Navigation
 * is intentionally left to the caller because the destination differs
 * between profile-initiated logout and forced logout from session restore.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { kvClearAll } from "../db/offlineKv";
import { notifyUserLoggedOut } from "./locationSession";

/**
 * Clears the active login session.
 *
 * - Always flips `notifyUserLoggedOut` first so any in-flight UI that reads
 *   `getActiveLocationSessionId()` immediately considers the user logged out
 *   even if `AsyncStorage.clear()` rejects (which can happen if storage is
 *   corrupt or the device is full).
 * - Storage failures are swallowed by design: we never want a logout to be
 *   blocked by a transient I/O error.
 */
export async function clearUserSession(): Promise<void> {
  notifyUserLoggedOut();
  try {
    await AsyncStorage.clear();
  } catch {
    // best-effort: in-memory session is already cleared above
  }
  try {
    kvClearAll();
  } catch {
    /* same philosophy as storage clear */
  }
}
