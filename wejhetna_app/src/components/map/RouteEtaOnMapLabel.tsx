import React, { memo } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

export type RouteEtaOnMapLabelProps = {
  /** Remaining time label (already localized). */
  label: string;
  /** Match active route line color. */
  accentColor?: string;
};

/**
 * Compact speech-bubble chip + tail for remaining ETA on the route polyline
 * (active navigation only). Parent supplies a MapLibre `PointAnnotation` with
 * `anchor={{ x: 0.5, y: 1 }}` so the tail lands on the road line.
 */
function RouteEtaOnMapLabelInner({ label, accentColor = "#4285F4" }: RouteEtaOnMapLabelProps) {
  return (
    <View style={styles.wrapper} pointerEvents="none">
      <View style={[styles.bubble, { backgroundColor: accentColor }]}>
        <Text style={styles.bubbleText} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <View style={[styles.tail, { borderTopColor: accentColor }]} />
    </View>
  );
}

export const RouteEtaOnMapLabel = memo(RouteEtaOnMapLabelInner);

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
  },
  bubble: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    maxWidth: 152,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.28,
        shadowRadius: 3,
      },
      android: { elevation: 5 },
      default: {},
    }),
  },
  bubbleText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },
  tail: {
    width: 0,
    height: 0,
    marginTop: -1,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
});
