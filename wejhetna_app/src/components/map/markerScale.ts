/**
 * Shared zoom→scale curves for map markers.
 *
 * Goals (Google Maps-like behaviour):
 *  - Markers never disappear because they got "too small" — we clamp to a readable minimum.
 *  - Markers never balloon at high zoom — we clamp to a comfortable maximum.
 *  - The transition is *smooth* (piecewise-linear interpolation), not the harsh
 *    `0.7 + zoom * 0.03` line that snapped at the bounds.
 *  - Logic is `transform: scale(...)` only — never layout — so no relayout per zoom tick.
 *
 * Both helpers are pure, allocation-free, and safe to call from inline render paths.
 */

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/** Linear interpolation `t∈[0,1]` between `a` and `b`. */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Place-pin scale.
 *
 * Curve (piecewise-linear, clamped):
 *  - `zoom <= 10` → 0.85  (still visible at city/regional zoom — never collapses to 0)
 *  - `zoom == 14` → 1.00  ("normal" — typical neighbourhood browsing)
 *  - `zoom >= 18` → 1.20  (slightly larger when fully zoomed, never huge)
 *
 * Range hard-clamped to `[0.85, 1.20]` to match the design spec: "around 0.85x → 1.2x max".
 */
export function getMapPinScale(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  if (zoom <= 10) return 0.85;
  if (zoom >= 18) return 1.2;
  if (zoom <= 14) {
    const t = (zoom - 10) / 4; // 10..14 → 0..1
    return clamp(lerp(0.85, 1.0, t), 0.85, 1.0);
  }
  const t = (zoom - 14) / 4; // 14..18 → 0..1
  return clamp(lerp(1.0, 1.2, t), 1.0, 1.2);
}

/**
 * User-location dot scale. Stays in a narrower band so the dot is always recognisable
 * but never dominates the screen. Range `[0.9, 1.1]`.
 */
export function getUserDotScale(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  if (zoom <= 11) return 0.9;
  if (zoom >= 18) return 1.1;
  const t = (zoom - 11) / 7;
  return clamp(lerp(0.9, 1.1, t), 0.9, 1.1);
}

/**
 * Quantize a raw zoom value to the nearest half-step. Use this when storing zoom in component
 * state that drives marker re-renders — sub-step zoom changes should NOT cascade through
 * the entire marker subtree on every camera tick.
 */
export function quantizeZoomForMarkers(zoom: number): number {
  if (!Number.isFinite(zoom)) return 14;
  return Math.round(zoom * 2) / 2;
}
