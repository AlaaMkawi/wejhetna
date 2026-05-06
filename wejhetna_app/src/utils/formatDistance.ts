import type { TFunction } from "i18next";

/**
 * Format a distance (given in kilometers) into a clean, user-friendly string.
 *
 * Rules:
 *  - `null` / non-finite / negative  → returns `null` (caller should hide the UI line)
 *  - distance >= 1 km                → rendered in kilometers, e.g. "2.4 km", "1 km"
 *  - distance <  1 km                → rendered in meters, e.g. "850 m", "120 m"
 *    (snapped to 10 m buckets, with a floor of 10 m so tiny but non-zero
 *    distances never collapse to "0 m" or show as "0 km" as they did before)
 *
 * This is the single source of truth for driver-selection / nearby-driver
 * distance displays. Translations use `ride_km` and `ride_m` so Arabic /
 * Hebrew renderings stay consistent with the rest of the app.
 */
export type FormatDistanceOptions = {
  /** Translation function (react-i18next). Units fall back to English if not provided. */
  t?: TFunction | ((key: string) => string);
  /**
   * If true, the unit is returned joined to the number in the same span.
   * Defaults to true. Set to false if you prefer to render the unit
   * separately (e.g. with a different style).
   */
  withUnit?: boolean;
};

export type FormattedDistance = {
  /** Final, user-facing string (empty if `km` was invalid). */
  text: string;
  /** The numeric part only, e.g. "2.4" or "850". */
  value: string;
  /** The unit part only, e.g. "km" or "m". */
  unit: string;
  /** Which bucket was used. */
  scale: "km" | "m";
};

const KM_UNIT_FALLBACK = "km";
const M_UNIT_FALLBACK = "m";

function safeTranslate(
  t: FormatDistanceOptions["t"],
  key: string,
  fallback: string,
): string {
  if (!t) return fallback;
  try {
    const v = (t as (k: string) => string)(key);
    if (typeof v === "string" && v.trim().length > 0 && v !== key) return v;
  } catch {
    // fall through
  }
  return fallback;
}

/**
 * Round to one decimal and strip trailing ".0".
 * Examples: 2.44 → "2.4"; 1.0 → "1"; 3.10 → "3.1".
 */
function formatKm(km: number): string {
  const rounded = Math.round(km * 10) / 10;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(1);
}

/**
 * Snap a meters value to a clean bucket:
 *   - < 100 m  → nearest 10 m, but never less than 10 m for non-zero input
 *   - < 1000 m → nearest 10 m
 * This avoids noisy "317 m" readings while staying accurate.
 */
function formatMeters(km: number): string {
  const meters = km * 1000;
  if (meters <= 0) return "0";
  const rounded = Math.max(10, Math.round(meters / 10) * 10);
  return String(rounded);
}

export function formatDistance(
  km: number | null | undefined,
  opts: FormatDistanceOptions = {},
): FormattedDistance | null {
  if (km == null) return null;
  const num = Number(km);
  if (!Number.isFinite(num) || num < 0) return null;

  const { t, withUnit = true } = opts;

  if (num >= 1) {
    const value = formatKm(num);
    const unit = safeTranslate(t, "ride_km", KM_UNIT_FALLBACK);
    return {
      text: withUnit ? `${value} ${unit}` : value,
      value,
      unit,
      scale: "km",
    };
  }

  const value = formatMeters(num);
  const unit = safeTranslate(t, "ride_m", M_UNIT_FALLBACK);
  return {
    text: withUnit ? `${value} ${unit}` : value,
    value,
    unit,
    scale: "m",
  };
}

/**
 * Convenience: returns just the formatted string, or `null` if the input
 * is invalid. Useful when you only need to render `{formatDistanceText(km, t)}`.
 */
export function formatDistanceText(
  km: number | null | undefined,
  t?: FormatDistanceOptions["t"],
): string | null {
  const r = formatDistance(km, { t });
  return r ? r.text : null;
}
