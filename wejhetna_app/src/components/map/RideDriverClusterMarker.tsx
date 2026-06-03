import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";

/**
 * Cluster pin that matches the new `NearbyDriverTaxiMarker` look so that a
 * pile of overlapping drivers reads as "several taxis stacked here". Tapping
 * is handled by the parent `PointAnnotation`, which zooms the camera so the
 * cluster naturally splits into individual markers on the next render.
 *
 * Anchoring matches `NearbyDriverTaxiMarker` — pair with
 * `anchor={{ x: 0.5, y: 1 }}` on the parent so the tip lands on the GPS coord.
 */

const CLUSTER_FILL = "#facc15";
const CLUSTER_FILL_DEEP = "#eab308";
const CLUSTER_TEXT = "#1f2937";
const ACCENT = "#f59e0b";
const PLATE_BG = "#ffffff";

export type RideDriverClusterMarkerProps = {
  /** Number of drivers inside the cluster. Values over 99 show as "99+". */
  count: number;
  /** Optional: renders a slightly bigger badge when the user is actively exploring clusters. */
  emphasized?: boolean;
  accessibilityLabel?: string;
};

export function RideDriverClusterMarker({
  count,
  emphasized = false,
  accessibilityLabel,
}: RideDriverClusterMarkerProps) {
  const pin = emphasized ? 56 : 50;
  const plate = emphasized ? 30 : 27;
  const label = count > 99 ? "99+" : String(count);
  const plateTop = pin * 0.16;

  return (
    <View
      style={[styles.hit, { width: pin, height: pin }]}
      collapsable={false}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <View style={styles.shadowPlate}>
        <Ionicons
          name="location"
          size={pin}
          color={emphasized ? CLUSTER_FILL_DEEP : CLUSTER_FILL}
          style={styles.pin}
        />
        <View
          pointerEvents="none"
          style={[
            styles.pinInnerStroke,
            {
              width: pin * 0.78,
              height: pin * 0.78,
              borderRadius: (pin * 0.78) / 2,
              top: plateTop - pin * 0.04,
              left: (pin - pin * 0.78) / 2,
              borderColor: emphasized ? ACCENT : "rgba(255,255,255,0.85)",
              borderWidth: emphasized ? 2 : 1.25,
            },
          ]}
        />
        <View
          style={[
            styles.plate,
            {
              width: plate,
              height: plate,
              borderRadius: plate / 2,
              top: plateTop,
              left: (pin - plate) / 2,
            },
          ]}
        >
          <Text
            style={[
              styles.countText,
              { fontSize: count > 9 ? 12 : 14 },
            ]}
            numberOfLines={1}
            allowFontScaling={false}
          >
            {label}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hit: {
    alignItems: "center",
    justifyContent: "flex-start",
  },
  shadowPlate: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "flex-start",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.28,
        shadowRadius: 5,
      },
      android: {
        elevation: 6,
      },
      default: {},
    }),
  },
  pin: {
    textAlign: "center",
  },
  pinInnerStroke: {
    position: "absolute",
    backgroundColor: "transparent",
  },
  plate: {
    position: "absolute",
    backgroundColor: PLATE_BG,
    alignItems: "center",
    justifyContent: "center",
  },
  countText: {
    color: CLUSTER_TEXT,
    fontWeight: "800",
    letterSpacing: 0.2,
    includeFontPadding: false as unknown as boolean,
  },
});

export default RideDriverClusterMarker;
