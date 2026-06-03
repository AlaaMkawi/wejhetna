import type { RouteLineStringCoords } from "../types/navigation";
import { kvDelete, kvGet, kvSet } from "./offlineKv";

const KEY = "nav_route_snapshot_v1";

export interface NavigationRouteSnapshotV1 {
  version: 1;
  routeLine: RouteLineStringCoords;
  destination: { lat: number; lon: number; name?: string };
  legDistanceMeters: number;
  legDurationSeconds: number;
  updatedAt: number;
}

export function saveNavigationRouteSnapshot(payload: NavigationRouteSnapshotV1): void {
  try {
    kvSet(KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn("[offline] saveNavigationRouteSnapshot failed", e);
  }
}

export function loadNavigationRouteSnapshot(): NavigationRouteSnapshotV1 | null {
  try {
    const raw = kvGet(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NavigationRouteSnapshotV1;
    if (parsed?.version !== 1 || !Array.isArray(parsed.routeLine)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearNavigationRouteSnapshot(): void {
  try {
    kvDelete(KEY);
  } catch (e) {
    console.warn("[offline] clearNavigationRouteSnapshot failed", e);
  }
}
