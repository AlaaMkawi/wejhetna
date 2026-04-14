import React, { memo, useEffect, useMemo, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { PointAnnotation } from "@maplibre/maplibre-react-native";

type Props = {
  id?: string;
  coordinate: [number, number]; // [lon, lat]
  /** degrees in screen space (already compensated for map bearing if needed) */
  bearingDeg: number;
};

function normalizeDeg(d: number): number {
  const x = ((d % 360) + 360) % 360;
  return x;
}

function shortestDelta(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

function NavigationMarkerInner({ id = "nav_user_marker", coordinate, bearingDeg }: Props) {
  const rot = useRef(new Animated.Value(normalizeDeg(bearingDeg))).current;
  const lastDegRef = useRef(normalizeDeg(bearingDeg));

  useEffect(() => {
    const next = normalizeDeg(bearingDeg);
    const prev = lastDegRef.current;
    const delta = shortestDelta(prev, next);
    const target = prev + delta;
    lastDegRef.current = normalizeDeg(target);
    Animated.timing(rot, {
      toValue: lastDegRef.current,
      duration: 140,
      useNativeDriver: true,
    }).start();
  }, [bearingDeg, rot]);

  const rotate = useMemo(
    () =>
      rot.interpolate({
        inputRange: [0, 360],
        outputRange: ["0deg", "360deg"],
      }),
    [rot]
  );

  return (
    <PointAnnotation id={id} coordinate={coordinate}>
      <View style={styles.container} pointerEvents="none">
        {/* subtle glow */}
        <View style={styles.glow} />

        {/* directional cone + dot */}
        <Animated.View style={[styles.directionWrapper, { transform: [{ rotate }] }]}>
          <View style={styles.cone} />
          <View style={styles.dotOuter}>
            <View style={styles.dotInner} />
          </View>
        </Animated.View>
      </View>
    </PointAnnotation>
  );
}

function areEqual(prev: Props, next: Props) {
  // Avoid re-render if coordinate and bearing are effectively the same
  if (prev.coordinate[0] !== next.coordinate[0] || prev.coordinate[1] !== next.coordinate[1]) {
    return false;
  }
  const a = normalizeDeg(prev.bearingDeg);
  const b = normalizeDeg(next.bearingDeg);
  return Math.abs(shortestDelta(a, b)) < 0.8;
}

export const NavigationMarker = memo(NavigationMarkerInner, areEqual);

const BLUE = "#1A73E8";

const styles = StyleSheet.create({
  container: {
    width: 54,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
  },
  glow: {
    position: "absolute",
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: BLUE,
    opacity: 0.16,
  },
  directionWrapper: {
    width: 54,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
  },
  cone: {
    position: "absolute",
    top: 2,
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderBottomWidth: 20,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: BLUE,
    opacity: 0.32,
    transform: [{ translateY: -6 }],
  },
  dotOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 3,
    borderColor: BLUE,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 3,
  },
  dotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: BLUE,
  },
});

