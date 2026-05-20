import { Platform } from "react-native";

/** iOS-only: hide all map overlays during screen transitions / stack changes. */
let overlaysSuppressed = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

export function subscribeMapOverlaySuppress(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function areMapOverlaysSuppressed(): boolean {
  return Platform.OS === "ios" && overlaysSuppressed;
}

export function suppressMapOverlays(): void {
  if (Platform.OS !== "ios" || overlaysSuppressed) {
    return;
  }
  overlaysSuppressed = true;
  notify();
}

export function releaseMapOverlays(): void {
  if (Platform.OS !== "ios" || !overlaysSuppressed) {
    return;
  }
  overlaysSuppressed = false;
  notify();
}

export function resetMapOverlaySuppress(): void {
  if (Platform.OS === "ios") {
    overlaysSuppressed = false;
    notify();
  }
}
