import { Platform } from "react-native";

/**
 * Map-ready flag lives outside React context so screens can gate overlays from
 * the same component that renders FocusedMapView (provider is inside the map).
 */
let mapReady = Platform.OS !== "ios";
const listeners = new Set<() => void>();

export function getMapAnnotationsReady(): boolean {
  return mapReady;
}

export function setMapAnnotationsReady(value: boolean): void {
  if (mapReady === value) {
    return;
  }
  mapReady = value;
  listeners.forEach((listener) => listener());
}

export function subscribeMapAnnotationsReady(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetMapAnnotationsReadyForPlatform(): void {
  setMapAnnotationsReady(Platform.OS !== "ios");
}
