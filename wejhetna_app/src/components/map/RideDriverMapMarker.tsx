import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";

/** Brand teal — matches app accent; blue ring distinguishes driver from pickup marker. */
const DRIVER_FILL = "#0f5b63";
const DRIVER_RING = "#1565c0";
const ICON = "#ffffff";

export type RideDriverMapMarkerSize = "tiny" | "compact" | "default" | "expanded";

export type RideDriverMapMarkerProps = {
  /** Clockwise degrees from north; when set, the car rotates with direction of travel. */
  headingDeg?: number | null;
  size?: RideDriverMapMarkerSize;
  /** Default `car-sport`; use `car` for taxi-style live passenger tracking. */
  vehicleIcon?: "car-sport" | "car";
};

/**
 * Marker pixel sizes tuned so several drivers can coexist on the map without
 * obscuring each other while remaining comfortably tappable (~36-40dp minimum).
 */
const SIZE_MAP: Record<RideDriverMapMarkerSize, { outer: number; icon: number }> = {
  tiny: { outer: 30, icon: 15 },
  compact: { outer: 38, icon: 19 },
  default: { outer: 48, icon: 24 },
  expanded: { outer: 56, icon: 28 },
};

/**
 * High-contrast driver marker for MapLibre `PointAnnotation` children (custom styling, not the default pin).
 */
export function RideDriverMapMarker({
  headingDeg,
  size = "default",
  vehicleIcon = "car-sport",
}: RideDriverMapMarkerProps) {
  const { outer: w, icon } = SIZE_MAP[size];
  // Thinner ring at small sizes keeps the car icon visible.
  const ringBorder = size === "tiny" ? 2 : size === "compact" ? 2.5 : 3;
  const inner = Math.max(12, w - ringBorder * 2 - 4);
  const rotate =
    headingDeg != null && Number.isFinite(headingDeg) ? [{ rotate: `${headingDeg}deg` }] : [];

  return (
    <View style={styles.hit}>
      <View style={[styles.shadowPlate, { width: w + 8, height: w + 8 }]}>
        <View style={[styles.rotate, { transform: rotate }]}>
          <View
            style={[
              styles.ring,
              {
                width: w,
                height: w,
                borderRadius: w / 2,
                borderWidth: ringBorder,
              },
            ]}
          >
            <View
              style={[
                styles.fill,
                {
                  width: inner,
                  height: inner,
                  borderRadius: inner / 2,
                },
              ]}
            >
              <Ionicons name={vehicleIcon} size={icon} color={ICON} />
            </View>
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
  rotate: {
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    borderColor: DRIVER_RING,
    backgroundColor: "rgba(255,255,255,0.98)",
    alignItems: "center",
    justifyContent: "center",
  },
  fill: {
    backgroundColor: DRIVER_FILL,
    alignItems: "center",
    justifyContent: "center",
  },
});
