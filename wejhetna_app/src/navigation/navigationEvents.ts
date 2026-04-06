import { DeviceEventEmitter } from "react-native";

/** Emitted when user stops live navigation and returns to the map home — clear draft route UI state. */
export const LIVE_NAVIGATION_EXIT_EVENT = "wejhetna:LIVE_NAVIGATION_EXIT";

export function emitLiveNavigationExit(): void {
  DeviceEventEmitter.emit(LIVE_NAVIGATION_EXIT_EVENT);
}
