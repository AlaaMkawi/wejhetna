import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";

/** Matches the brand teal used by the single-driver marker for visual coherence. */
const CLUSTER_FILL = "#0f5b63";
const CLUSTER_RING = "#1565c0";
const CLUSTER_TEXT = "#ffffff";

export type RideDriverClusterMarkerProps = {
  /** Number of drivers inside the cluster. Values over 99 show as "99+". */
  count: number;
  /** Optional: renders a slightly bigger badge when the user is actively exploring clusters. */
  emphasized?: boolean;
};

/**
 * Compact round badge shown when multiple driver pins would overlap. Tapping
 * is handled by the parent `PointAnnotation`, which zooms the camera so the
 * drivers separate into individual markers.
 */
export function RideDriverClusterMarker({ count, emphasized = false }: RideDriverClusterMarkerProps) {
  const size = emphasized ? 46 : 40;
  const inner = size - 6;
  const label = count > 99 ? "99+" : String(count);

  return (
    <View style={styles.hit}>
      <View style={[styles.shadowPlate, { width: size + 8, height: size + 8 }]}>
        <View
          style={[
            styles.ring,
            { width: size, height: size, borderRadius: size / 2 },
          ]}
        >
          <View
            style={[
              styles.fill,
              { width: inner, height: inner, borderRadius: inner / 2 },
            ]}
          >
            <Ionicons name="car-sport" size={12} color={CLUSTER_TEXT} style={styles.carGlyph} />
            <Text
              style={[
                styles.countText,
                { fontSize: count > 9 ? 14 : 16 },
              ]}
              numberOfLines={1}
            >
              {label}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hit: {
    alignItems: "center",
    justifyContent: "center",
  },
  shadowPlate: {
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.35,
        shadowRadius: 5,
      },
      android: {
        elevation: 6,
      },
      default: {},
    }),
  },
  ring: {
    borderWidth: 2.5,
    borderColor: CLUSTER_RING,
    backgroundColor: "rgba(255,255,255,0.98)",
    alignItems: "center",
    justifyContent: "center",
  },
  fill: {
    backgroundColor: CLUSTER_FILL,
    alignItems: "center",
    justifyContent: "center",
  },
  carGlyph: {
    position: "absolute",
    top: 3,
    opacity: 0.85,
  },
  countText: {
    marginTop: 6,
    color: CLUSTER_TEXT,
    fontWeight: "800",
    letterSpacing: 0.3,
    includeFontPadding: false as unknown as boolean,
  },
});

export default RideDriverClusterMarker;
