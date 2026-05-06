import React, { memo } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import { getMapPinScale } from "./markerScale";

/**
 * Visual category — drives icon + color. Decoupled from the backend `place_type`
 * because a single `place_type` (e.g. PUBLIC_SERVICE) can map to many visuals.
 */
export type MapPinCategory =
  | "mosque"
  | "school"
  | "clinic"
  | "kindergarten"
  | "community"
  | "home"
  | "public"
  | "business"
  | "default";

type IconSpec = { lib: "ion" | "mci"; name: string };

/**
 * One source of truth for category → icon & default color. Each entry MUST share the same
 * pin shape (handled below); only icon and color change. This is the "consistent design system"
 * the spec asks for.
 */
const CATEGORY_VISUALS: Record<MapPinCategory, { color: string; icon: IconSpec }> = {
  mosque: { color: "#4285F4", icon: { lib: "mci", name: "mosque" } },
  school: { color: "#34A853", icon: { lib: "ion", name: "school" } },
  clinic: { color: "#EA4335", icon: { lib: "mci", name: "hospital-building" } },
  kindergarten: { color: "#FBBC04", icon: { lib: "mci", name: "baby-face-outline" } },
  community: { color: "#9AA0A6", icon: { lib: "mci", name: "account-group" } },
  home: { color: "#FF9800", icon: { lib: "ion", name: "home" } },
  public: { color: "#4285F4", icon: { lib: "ion", name: "location" } },
  business: { color: "#EA4335", icon: { lib: "ion", name: "business" } },
  default: { color: "#4285F4", icon: { lib: "ion", name: "location" } },
};

export type MapPinProps = {
  category: MapPinCategory;
  /** Optional override (e.g. backend category supplies a custom color). */
  colorOverride?: string;
  selected?: boolean;
  /** Current map zoom (already quantized — see `quantizeZoomForMarkers`). */
  zoom: number;
  /** When provided + `showLabel`, a small labelled chip renders below the pin. */
  label?: string | null;
  showLabel?: boolean;
};

/**
 * Base size of the icon disc at `scale=1`. The pin point underneath uses a triangle that
 * grows with the disc so the silhouette remains consistent across zoom and selection states.
 */
const BASE_DISC = 40;
const BASE_ICON = 18;
const BASE_POINT_W = 16;
const BASE_POINT_H = 12;

/**
 * Reusable place pin — same shape across all categories, only icon + color change. Selected
 * state adds a stronger ring + shadow boost on top of the smooth zoom scale (no abrupt size
 * jumps). All sizing is applied via `transform: scale(...)` so layout never reflows.
 */
function MapPinInner({
  category,
  colorOverride,
  selected = false,
  zoom,
  label,
  showLabel,
}: MapPinProps) {
  const visual = CATEGORY_VISUALS[category] ?? CATEGORY_VISUALS.default;
  const color = colorOverride || visual.color;

  // Smooth zoom-driven scale (clamped to the design range), with a small selected boost.
  // Selected pins are ~15% larger — enough to read as the "active" pin without overpowering.
  const zoomScale = getMapPinScale(zoom);
  const finalScale = zoomScale * (selected ? 1.15 : 1);

  return (
    <View style={styles.hit} pointerEvents="box-none">
      <View
        style={[
          styles.pinWrapper,
          {
            // `transformOrigin` doesn't exist on RN Views, but the pin point sits at the bottom of
            // the pinWrapper — using `scale` here keeps the *visual* anchor at the GPS coordinate
            // because the PointAnnotation centers the wrapper and the wrapper itself bottom-anchors.
            transform: [{ scale: finalScale }],
          },
        ]}
      >
        <View
          style={[
            styles.disc,
            {
              backgroundColor: color,
              borderColor: "#FFFFFF",
            },
            selected ? styles.discSelected : null,
          ]}
        >
          {visual.icon.lib === "mci" ? (
            <MaterialCommunityIcons name={visual.icon.name} size={BASE_ICON} color="#FFFFFF" />
          ) : (
            <Ionicons name={visual.icon.name} size={BASE_ICON} color="#FFFFFF" />
          )}
        </View>
        <View
          style={[
            styles.pinPoint,
            {
              borderTopColor: color,
            },
          ]}
        />
      </View>

      {showLabel && label ? (
        <View
          style={[
            styles.labelWrapper,
            selected ? styles.labelSelected : null,
            // Counter-scale so labels don't grow with the pin (Google Maps-like — labels stay legible).
            { transform: [{ scale: Math.min(1.05, zoomScale) }] },
          ]}
        >
          <View style={[styles.labelIconChip, { backgroundColor: color }]}>
            {visual.icon.lib === "mci" ? (
              <MaterialCommunityIcons name={visual.icon.name} size={11} color="#FFFFFF" />
            ) : (
              <Ionicons name={visual.icon.name} size={11} color="#FFFFFF" />
            )}
          </View>
          <Text style={styles.labelText} numberOfLines={1}>
            {label}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Memo on prop equality is important: every camera tick re-renders the parent screen, but the
 * pin should only repaint when its own visual inputs change. With the screen quantizing zoom
 * to half-steps this means most camera moves are no-ops here.
 */
function arePinPropsEqual(a: MapPinProps, b: MapPinProps): boolean {
  return (
    a.category === b.category &&
    a.colorOverride === b.colorOverride &&
    a.selected === b.selected &&
    a.zoom === b.zoom &&
    a.label === b.label &&
    a.showLabel === b.showLabel
  );
}

export const MapPin = memo(MapPinInner, arePinPropsEqual);

const styles = StyleSheet.create({
  hit: {
    alignItems: "center",
    justifyContent: "flex-start",
    overflow: "visible",
  },
  pinWrapper: {
    alignItems: "center",
    justifyContent: "flex-start",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.28,
        shadowRadius: 5,
      },
      android: {
        elevation: 6,
      },
      default: {},
    }),
  },
  disc: {
    width: BASE_DISC,
    height: BASE_DISC,
    borderRadius: BASE_DISC / 2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    zIndex: 2,
  },
  discSelected: {
    borderWidth: 4,
    // The visual emphasis on selected comes from a stronger border + the parent shadow boost
    // below; size emphasis is the `1.15` scale multiplier in render so it stays *smooth*.
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 7,
      },
      android: {
        elevation: 9,
      },
      default: {},
    }),
  },
  pinPoint: {
    width: 0,
    height: 0,
    backgroundColor: "transparent",
    borderStyle: "solid",
    borderLeftWidth: BASE_POINT_W / 2,
    borderRightWidth: BASE_POINT_W / 2,
    borderTopWidth: BASE_POINT_H,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    marginTop: -3,
    zIndex: 1,
  },
  labelWrapper: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.12)",
    maxWidth: 160,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.16,
        shadowRadius: 3,
      },
      android: {
        elevation: 3,
      },
      default: {},
    }),
  },
  labelSelected: {
    backgroundColor: "#F8F9FA",
    borderColor: "rgba(0,0,0,0.22)",
    ...Platform.select({
      ios: {
        shadowOpacity: 0.24,
        shadowRadius: 4,
      },
      android: {
        elevation: 5,
      },
      default: {},
    }),
  },
  labelIconChip: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },
  labelText: {
    fontSize: 11,
    fontWeight: "500",
    color: "#1A1A1A",
    letterSpacing: -0.1,
    flexShrink: 1,
  },
});

export default MapPin;
