import type { LatLon } from "./locationPermission";

const EASE_OUT_CUBIC = (t: number) => 1 - Math.pow(1 - t, 3);

function nowMs(): number {
  const perf = (globalThis as { performance?: { now?: () => number } }).performance;
  if (perf?.now) return perf.now();
  return Date.now();
}

/** Shortest delta in degrees for bearing interpolation (-180..180] */
export function shortestBearingDelta(fromDeg: number, toDeg: number): number {
  return ((((toDeg - fromDeg) % 360) + 540) % 360) - 180;
}

/**
 * Smoothly interpolates display position toward GPS fixes (reduces marker “teleporting”).
 */
export function createLatLonSmoother(options: { durationMs?: number } = {}) {
  const durationMs = options.durationMs ?? 380;
  let rafId: number | null = null;
  let display: LatLon | undefined;
  let startTime = 0;
  let from: LatLon;
  let target: LatLon;

  const cancel = () => {
    if (rafId != null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  const initialize = (initial: LatLon) => {
    cancel();
    display = { ...initial };
    from = { ...initial };
    target = { ...initial };
  };

  const runFrame = (onFrame: (p: LatLon) => void, onComplete?: () => void) => {
    const step = () => {
      const elapsed = nowMs() - startTime;
      const t = Math.min(1, elapsed / durationMs);
      const e = EASE_OUT_CUBIC(t);
      display = {
        lat: from.lat + (target.lat - from.lat) * e,
        lon: from.lon + (target.lon - from.lon) * e,
      };
      onFrame(display);
      if (t < 1) {
        rafId = requestAnimationFrame(step);
      } else {
        rafId = null;
        display = { ...target };
        onFrame(display);
        onComplete?.();
      }
    };
    rafId = requestAnimationFrame(step);
  };

  /**
   * Move display from its current visual position toward `next` (restarts easing if called mid-flight).
   */
  const animateTo = (next: LatLon, onFrame: (p: LatLon) => void) => {
    cancel();
    const d = display ?? next;
    from = { ...d };
    target = { ...next };
    display = { ...d };
    startTime = nowMs();
    runFrame(onFrame);
  };

  const getDisplay = (): LatLon | undefined => (display ? { ...display } : undefined);

  return { initialize, animateTo, cancel, getDisplay };
}

/**
 * Low-pass style heading for arrow / camera (fraction 0..1 per update).
 */
export function smoothHeadingStep(
  previous: number | null,
  target: number,
  blend = 0.35
): number {
  if (previous == null || Number.isNaN(previous)) {
    return target;
  }
  const delta = shortestBearingDelta(previous, target);
  let next = previous + delta * blend;
  next = ((next % 360) + 360) % 360;
  return next;
}
