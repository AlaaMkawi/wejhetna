import { kvDelete, kvSet } from "./offlineKv";

const NAV_ROUTE_KEY = "navigation_route_snapshot";

export type NavigationRouteSnapshot = {
  version: number;
  routeLine: [number, number][];
  destination: { lat: number; lon: number; name?: string };
  legDistanceMeters: number;
  legDurationSeconds: number;
  updatedAt: number;
};

export function saveNavigationRouteSnapshot(snapshot: NavigationRouteSnapshot): void {
  try {
    kvSet(NAV_ROUTE_KEY, JSON.stringify(snapshot));
  } catch {
    // best-effort crash / recovery persistence
  }
}

export function clearNavigationRouteSnapshot(): void {
  try {
    kvDelete(NAV_ROUTE_KEY);
  } catch {
    // best-effort
  }
}
