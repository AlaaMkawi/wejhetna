import React, { memo } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import { Colors } from "../../theme";
import { getMapPinScale } from "./markerScale";
import {
  mapMarkerStyles,
  MARKER_BORDER,
  MARKER_BRAND,
  MARKER_SURFACE,
  PLACE_CATEGORY_THEME,
  resolvePlaceMarkerColors,
} from "./mapMarkerTheme";

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

export type MapPinProps = {
  category: MapPinCategory;
  colorOverride?: string;
  selected?: boolean;
  zoom: number;
  label?: string | null;
  showLabel?: boolean;
  /** Prefer over MapLibre `PointAnnotation.onSelected` (avoids re-fire on zoom rebuilds). */
  onPress?: () => void;
};

const CARD = 38;
const INNER = 30;
const ICON = 17;
const GROUND = 7;

function MapPinInner({
  category,
  colorOverride,
  selected = false,
  zoom,
  label,
  showLabel,
  onPress,
}: MapPinProps) {
  const visual = PLACE_CATEGORY_THEME[category] ?? PLACE_CATEGORY_THEME.default;
  const { tint, accent } = resolvePlaceMarkerColors(category, colorOverride);

  const zoomScale = getMapPinScale(zoom);
  const finalScale = zoomScale * (selected ? 1.1 : 1);

  const iconEl =
    visual.icon.lib === "mci" ? (
      <MaterialCommunityIcons name={visual.icon.name} size={ICON} color={accent} />
    ) : (
      <Ionicons name={visual.icon.name} size={ICON} color={accent} />
    );

  const body = (
    <View style={styles.hit} pointerEvents="box-none" collapsable={false}>
      <View
        style={[
          styles.column,
          mapMarkerStyles.floatShadow,
          selected ? mapMarkerStyles.floatShadowSelected : null,
          { transform: [{ scale: finalScale }] },
        ]}
      >
        <View
          style={[
            styles.card,
            selected ? styles.cardSelected : null,
          ]}
        >
          <View style={[styles.inner, { backgroundColor: tint }]}>
            {iconEl}
          </View>
        </View>
        <View
          style={[
            styles.groundDot,
            {
              backgroundColor: accent,
              borderColor: MARKER_SURFACE,
            },
            selected ? styles.groundDotSelected : null,
          ]}
        />
      </View>

      {showLabel && label ? (
        <View
          style={[
            styles.labelChip,
            selected ? styles.labelChipSelected : null,
            { transform: [{ scale: Math.min(1.04, zoomScale) }] },
          ]}
        >
          <View style={[styles.labelDot, { backgroundColor: accent }]} />
          <Text style={styles.labelText} numberOfLines={1}>
            {label}
          </Text>
        </View>
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button">
        {body}
      </Pressable>
    );
  }
  return body;
}

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
  column: {
    alignItems: "center",
  },
  card: {
    width: CARD,
    height: CARD,
    borderRadius: CARD / 2,
    backgroundColor: MARKER_SURFACE,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: MARKER_BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  cardSelected: {
    borderWidth: 2,
    borderColor: MARKER_BRAND,
    backgroundColor: "#FAFEFE",
  },
  inner: {
    width: INNER,
    height: INNER,
    borderRadius: INNER / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  groundDot: {
    width: GROUND,
    height: GROUND,
    borderRadius: GROUND / 2,
    borderWidth: 1.5,
    marginTop: 3,
  },
  groundDotSelected: {
    width: GROUND + 2,
    height: GROUND + 2,
    borderRadius: (GROUND + 2) / 2,
    borderWidth: 2,
    borderColor: MARKER_BRAND,
  },
  labelChip: {
    marginTop: 5,
    flexDirection: "row",
    alignItems: "center",
    maxWidth: 168,
    backgroundColor: "rgba(255,255,255,0.96)",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: MARKER_BORDER,
    ...Platform.select({
      ios: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: { elevation: 2 },
    }),
  },
  labelChipSelected: {
    borderColor: Colors.primary,
    borderWidth: 1,
    backgroundColor: "#F5FCFD",
  },
  labelDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  labelText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#1E293B",
    letterSpacing: -0.2,
    flexShrink: 1,
  },
});

export default MapPin;
