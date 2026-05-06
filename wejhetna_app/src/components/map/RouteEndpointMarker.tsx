import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";

/**
 * Shared visual for the **start** and **end** of a route shown on the map.
 *
 * Design language matches the new app surface (soft, clean, modern):
 *  - "start" → white pill with a brand-teal ring and a small filled core,
 *    so it reads as the road origin without competing with the car marker.
 *  - "end"   → solid brand-teal disc with a soft white halo and a flag icon,
 *    so the destination feels like a clear, confident "drop here" point.
 *
 * Use as a `PointAnnotation` child:
 *
 *   <PointAnnotation id="route_end" coordinate={[lon, lat]}>
 *     <RouteEndpointMarker variant="end" />
 *   </PointAnnotation>
 */
export type RouteEndpointVariant = "start" | "end";

export type RouteEndpointMarkerProps = {
  variant: RouteEndpointVariant;
  /** Optional Ionicons override (default: none for "start", "flag" for "end"). */
  iconName?: string | null;
  /** Override the visible color tone. Defaults to the brand teal. */
  color?: string;
  /** Outer hit area diameter in dp. Defaults to a comfortable 28-32. */
  size?: number;
};

const BRAND = "#0f5b63";
const WHITE = "#ffffff";

export function RouteEndpointMarker({
  variant,
  iconName,
  color = BRAND,
  size,
}: RouteEndpointMarkerProps) {
  if (variant === "start") {
    const outer = size ?? 26;
    const inner = Math.max(8, Math.round(outer * 0.45));
    return (
      <View style={[styles.hit, { width: outer + 12, height: outer + 12 }]}>
        <View
          style={[
            styles.startOuter,
            {
              width: outer,
              height: outer,
              borderRadius: outer / 2,
              borderColor: color,
            },
          ]}
        >
          <View
            style={[
              styles.startInner,
              {
                width: inner,
                height: inner,
                borderRadius: inner / 2,
                backgroundColor: color,
              },
            ]}
          />
        </View>
      </View>
    );
  }

  // end variant
  const outer = size ?? 32;
  const halo = outer + 10;
  const iconSize = Math.round(outer * 0.55);
  const finalIcon = iconName === undefined ? "flag" : iconName;
  return (
    <View style={[styles.hit, { width: halo + 4, height: halo + 4 }]}>
      <View
        style={[
          styles.endHalo,
          {
            width: halo,
            height: halo,
            borderRadius: halo / 2,
          },
        ]}
      />
      <View
        style={[
          styles.endCore,
          {
            width: outer,
            height: outer,
            borderRadius: outer / 2,
            backgroundColor: color,
          },
        ]}
      >
        {finalIcon ? (
          <Ionicons name={finalIcon} size={iconSize} color={WHITE} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hit: {
    alignItems: "center",
    justifyContent: "center",
  },
  startOuter: {
    backgroundColor: WHITE,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.18,
        shadowRadius: 3,
      },
      android: {
        elevation: 3,
      },
      default: {},
    }),
  },
  startInner: {
    // Color comes from prop so the start dot can echo the chosen line color.
  },
  endHalo: {
    position: "absolute",
    backgroundColor: "rgba(255,255,255,0.85)",
    borderWidth: 1,
    borderColor: "rgba(15, 91, 99, 0.18)",
  },
  endCore: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: WHITE,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.22,
        shadowRadius: 4,
      },
      android: {
        elevation: 5,
      },
      default: {},
    }),
  },
});

export default RouteEndpointMarker;
