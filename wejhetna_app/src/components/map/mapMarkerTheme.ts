import { Platform, StyleSheet } from "react-native";
import { Colors } from "../../theme";
import type { MapPinCategory } from "./MapPin";

export const MARKER_BRAND = Colors.primary;
export const MARKER_SURFACE = "#FFFFFF";
export const MARKER_BORDER = "rgba(15, 91, 99, 0.14)";

type IconSpec = { lib: "ion" | "mci"; name: string };

export type CategoryTheme = {
  tint: string;
  accent: string;
  icon: IconSpec;
};

/** Premium palette: soft tint wash + saturated accent for line-style icons. */
export const PLACE_CATEGORY_THEME: Record<MapPinCategory, CategoryTheme> = {
  mosque: {
    tint: "#E8F3F5",
    accent: "#0f5b63",
    icon: { lib: "mci", name: "mosque" },
  },
  school: {
    tint: "#EAF5EE",
    accent: "#2E7D5E",
    icon: { lib: "ion", name: "school-outline" },
  },
  clinic: {
    tint: "#FDEEEE",
    accent: "#C94C4C",
    icon: { lib: "ion", name: "medkit-outline" },
  },
  kindergarten: {
    tint: "#FFF6E5",
    accent: "#C98A1A",
    icon: { lib: "mci", name: "baby-face-outline" },
  },
  community: {
    tint: "#F1F3F5",
    accent: "#5C6B73",
    icon: { lib: "mci", name: "account-group-outline" },
  },
  home: {
    tint: "#FFF3E8",
    accent: "#D97706",
    icon: { lib: "ion", name: "home-outline" },
  },
  public: {
    tint: "#E8F3F5",
    accent: "#0f5b63",
    icon: { lib: "ion", name: "location-outline" },
  },
  business: {
    tint: "#FCECEF",
    accent: "#B8455A",
    icon: { lib: "ion", name: "business-outline" },
  },
  default: {
    tint: "#E8F3F5",
    accent: "#0f5b63",
    icon: { lib: "ion", name: "location-outline" },
  },
};

/** Use backend color as accent when provided; keep readable tint from category defaults. */
export function resolvePlaceMarkerColors(
  category: MapPinCategory,
  colorOverride?: string
): { tint: string; accent: string } {
  const base = PLACE_CATEGORY_THEME[category] ?? PLACE_CATEGORY_THEME.default;
  const accent =
    colorOverride && /^#[0-9A-Fa-f]{6}$/.test(colorOverride)
      ? colorOverride
      : base.accent;
  return { tint: base.tint, accent };
}

export const mapMarkerStyles = StyleSheet.create({
  floatShadow: {
    ...Platform.select({
      ios: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  floatShadowSelected: {
    ...Platform.select({
      ios: {
        shadowColor: MARKER_BRAND,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.22,
        shadowRadius: 10,
      },
      android: { elevation: 7 },
      default: {},
    }),
  },
});
