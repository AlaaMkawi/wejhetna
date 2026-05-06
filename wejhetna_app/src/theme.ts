import { Platform } from "react-native";

/**
 * Central design tokens for the app.
 *
 * Goals:
 *  - One source of truth for colors / spacing / radius / shadows / typography.
 *  - Keep the teal brand identity, but reduce the "too much blue" feeling by
 *    pairing it with a warm amber accent and a clean neutral surface palette.
 *  - Give screens a consistent, modern base without forcing a mass rewrite.
 *
 * Usage:
 *   import { Colors, Spacing, Radius, Shadow, Typography } from "../theme";
 */

/** Brand teal, kept as the primary identity color. */
const BRAND_PRIMARY = "#0f5b63";
const BRAND_PRIMARY_DARK = "#0b464c";
const BRAND_PRIMARY_SOFT = "#e6f2f3";

/** Warm amber accent — used for ratings, highlights, taxi theme. */
const ACCENT_AMBER = "#f59e0b";
const ACCENT_AMBER_SOFT = "#fef3c7";

/** Neutral palette (slate-ish) — keeps the UI calm and reduces saturated blue. */
const NEUTRAL_BG = "#f4f7f9";
const NEUTRAL_SURFACE = "#ffffff";
const NEUTRAL_SURFACE_MUTED = "#f8fafc";
const NEUTRAL_BORDER = "#e5e7eb";
const NEUTRAL_BORDER_STRONG = "#cbd5e1";
const NEUTRAL_DIVIDER = "#eef1f4";

const TEXT_PRIMARY = "#0f172a";
const TEXT_SECONDARY = "#475569";
const TEXT_MUTED = "#94a3b8";
const TEXT_INVERSE = "#ffffff";

const STATUS_SUCCESS = "#047857";
const STATUS_SUCCESS_SOFT = "#d1fae5";
const STATUS_WARNING = "#b45309";
const STATUS_WARNING_SOFT = "#fef3c7";
const STATUS_DANGER = "#b91c1c";
const STATUS_DANGER_SOFT = "#fee2e2";
const STATUS_INFO = "#1d4ed8";
const STATUS_INFO_SOFT = "#dbeafe";

export const Colors = {
  // Surfaces
  bg: NEUTRAL_BG,
  surface: NEUTRAL_SURFACE,
  surfaceMuted: NEUTRAL_SURFACE_MUTED,
  border: NEUTRAL_BORDER,
  borderStrong: NEUTRAL_BORDER_STRONG,
  divider: NEUTRAL_DIVIDER,

  // Text
  text: TEXT_PRIMARY,
  textSecondary: TEXT_SECONDARY,
  textMuted: TEXT_MUTED,
  textInverse: TEXT_INVERSE,

  // Brand
  primary: BRAND_PRIMARY,
  primaryDark: BRAND_PRIMARY_DARK,
  primarySoft: BRAND_PRIMARY_SOFT,

  // Accent (warm)
  accent: ACCENT_AMBER,
  accentSoft: ACCENT_AMBER_SOFT,

  // Status
  success: STATUS_SUCCESS,
  successSoft: STATUS_SUCCESS_SOFT,
  warning: STATUS_WARNING,
  warningSoft: STATUS_WARNING_SOFT,
  danger: STATUS_DANGER,
  dangerSoft: STATUS_DANGER_SOFT,
  info: STATUS_INFO,
  infoSoft: STATUS_INFO_SOFT,

  // Overlays
  overlay: "rgba(15, 23, 42, 0.45)",
  overlayLight: "rgba(15, 23, 42, 0.2)",
} as const;

export const Spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const Radius = {
  xs: 4,
  sm: 8,
  md: 10,
  lg: 14,
  xl: 18,
  xxl: 24,
  pill: 999,
} as const;

/**
 * Platform-aware shadow presets.
 * Prefer `soft` for cards, `card` for elevated panels, `float` for overlays.
 */
export const Shadow = {
  none: Platform.select({
    ios: { shadowColor: "transparent", shadowOpacity: 0 },
    android: { elevation: 0 },
    default: {},
  }) as object,
  soft: Platform.select({
    ios: {
      shadowColor: "#0f172a",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
    },
    android: { elevation: 2 },
    default: {},
  }) as object,
  card: Platform.select({
    ios: {
      shadowColor: "#0f172a",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
    },
    android: { elevation: 4 },
    default: {},
  }) as object,
  float: Platform.select({
    ios: {
      shadowColor: "#0f172a",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.14,
      shadowRadius: 18,
    },
    android: { elevation: 10 },
    default: {},
  }) as object,
} as const;

export const Typography = {
  // Sizes
  sizeXs: 11,
  sizeSm: 12,
  sizeBase: 14,
  sizeMd: 15,
  sizeLg: 17,
  sizeXl: 20,
  sizeXxl: 24,
  sizeDisplay: 28,

  // Weights (stringified to satisfy RN typing)
  weightRegular: "400" as const,
  weightMedium: "500" as const,
  weightSemibold: "600" as const,
  weightBold: "700" as const,
  weightHeavy: "800" as const,

  // Line heights (relative to typical body)
  lineBody: 20,
  lineTitle: 26,
  lineDisplay: 32,
} as const;

/** Semantic helpers — small composable style snippets that screens can spread. */
export const Elevation = {
  cardSurface: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.soft,
  },
  modalSurface: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xxl,
    ...Shadow.float,
  },
} as const;

export type ThemeColors = typeof Colors;
export type ThemeSpacing = typeof Spacing;
export type ThemeRadius = typeof Radius;
export type ThemeTypography = typeof Typography;

export default { Colors, Spacing, Radius, Shadow, Typography, Elevation };
