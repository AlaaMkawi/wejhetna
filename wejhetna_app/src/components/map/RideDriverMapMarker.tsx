import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";

/** Brand teal — matches app accent; blue ring distinguishes driver from pickup marker. */
const DRIVER_FILL = "#0f5b63";
const DRIVER_RING = "#1565c0";
const ICON = "#ffffff";

export type RideDriverMapMarkerSize = "compact" | "default" | "expanded";

export type RideDriverMapMarkerProps = {
  /** Clockwise degrees from north; when set, the car rotates with direction of travel. */
  headingDeg?: number | null;
  size?: RideDriverMapMarkerSize;
  /** Default `car-sport`; use `car` for taxi-style live passenger tracking. */
  vehicleIcon?: "car-sport" | "car";
};

const SIZE_MAP: Record<RideDriverMapMarkerSize, { outer: number; icon: number }> = {
  compact: { outer: 46, icon: 22 },
  default: { outer: 54, icon: 27 },
  expanded: { outer: 62, icon: 31 },
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
  const inner = w - 10;
  const rotate =
    headingDeg != null && Number.isFinite(headingDeg) ? [{ rotate: `${headingDeg}deg` }] : [];

  return (
    <View style={styles.hit}>
      <View style={[styles.shadowPlate, { width: w + 10, height: w + 10 }]}>
        <View style={[styles.rotate, { transform: rotate }]}>
          <View style={[styles.ring, { width: w, height: w, borderRadius: w / 2 }]}>
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
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.5,
        shadowRadius: 8,
      },
      android: {
        elevation: 10,
      },
      default: {},
    }),
  },
  rotate: {
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    borderWidth: 3,
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
