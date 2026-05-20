import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Platform, StyleSheet, View } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";

type Props = {
  /** degrees in screen space (already compensated for map bearing if needed) */
  bearingDeg: number;
  /**
   * `minimal` — car icon only (modern turn-by-turn, on-road look).
   * `full` — legacy ring + cone (debug / alternate styling).
   */
  variant?: "minimal" | "full";
};

function normalizeDeg(d: number): number {
  const x = ((d % 360) + 360) % 360;
  return x;
}

function shortestDelta(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

/** Same blue family as active route line in RouteDetails (`NAV_BLUE`). */
const MINIMAL_CAR = "#4285F4";

/**
 * Moving "you" marker for active turn-by-turn navigation.
 *
 * - **minimal** (default): clean car icon with light shadow — reads on the road
 *   without a circular plate (consumer-maps style).
 * - **full**: prior design — teal disc + ring + directional cone (kept optional).
 *
 * Rotation is animated so small GPS heading jitter does not snap visibly.
 */
/**
 * Child of `PointAnnotation` only — do not wrap with another PointAnnotation.
 * Fabric recycles native views incorrectly when annotation wrappers nest on iOS.
 */
function NavigationMarkerInner({
  bearingDeg,
  variant = "minimal",
}: Props) {
  const useStaticRotation = Platform.OS === "ios";
  const rot = useRef(new Animated.Value(normalizeDeg(bearingDeg))).current;
  const lastDegRef = useRef(normalizeDeg(bearingDeg));
  const [staticDeg, setStaticDeg] = useState(normalizeDeg(bearingDeg));

  useEffect(() => {
    const next = normalizeDeg(bearingDeg);
    if (useStaticRotation) {
      setStaticDeg(next);
      lastDegRef.current = next;
      return;
    }
    const prev = lastDegRef.current;
    const delta = shortestDelta(prev, next);
    const target = prev + delta;
    lastDegRef.current = normalizeDeg(target);
    Animated.timing(rot, {
      toValue: lastDegRef.current,
      duration: 140,
      useNativeDriver: true,
    }).start();
  }, [bearingDeg, rot, useStaticRotation]);

  const rotate = useMemo(
    () =>
      rot.interpolate({
        inputRange: [0, 360],
        outputRange: ["0deg", "360deg"],
      }),
    [rot]
  );

  const staticRotate = useMemo(() => [{ rotate: `${staticDeg}deg` }], [staticDeg]);

  if (variant === "minimal") {
    return (
      <View style={styles.minimalHit} pointerEvents="none" collapsable={false}>
        {useStaticRotation ? (
          <View style={[styles.minimalPlate, { transform: staticRotate }]}>
            <Ionicons
              name="car"
              size={30}
              color={MINIMAL_CAR}
              style={styles.minimalIconCrisp}
            />
          </View>
        ) : (
          <Animated.View style={[styles.minimalPlate, { transform: [{ rotate }] }]}>
            <Ionicons
              name="car"
              size={30}
              color={MINIMAL_CAR}
              style={styles.minimalIconCrisp}
            />
          </Animated.View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.hit} pointerEvents="none" collapsable={false}>
      <View style={styles.glow} />
      {useStaticRotation ? (
        <View style={[styles.directionWrapper, { transform: staticRotate }]}>
          <View style={styles.cone} />
          <View style={styles.ring}>
            <View style={styles.fill}>
              <Ionicons name="car" size={20} color={ICON} />
            </View>
          </View>
        </View>
      ) : (
        <Animated.View style={[styles.directionWrapper, { transform: [{ rotate }] }]}>
          <View style={styles.cone} />
          <View style={styles.ring}>
            <View style={styles.fill}>
              <Ionicons name="car" size={20} color={ICON} />
            </View>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

function areEqual(prev: Props, next: Props) {
  if (prev.variant !== next.variant) return false;
  const a = normalizeDeg(prev.bearingDeg);
  const b = normalizeDeg(next.bearingDeg);
  return Math.abs(shortestDelta(a, b)) < 0.8;
}

export const NavigationMarker = memo(NavigationMarkerInner, areEqual);

const NAV_FILL = "#0f5b63";
const NAV_RING = "#1565c0";
const ICON = "#ffffff";
const GLOW = "rgba(15, 91, 99, 0.18)";

const RING_SIZE = 44;
const RING_BORDER = 3;
const FILL_SIZE = RING_SIZE - RING_BORDER * 2 - 4;

const styles = StyleSheet.create({
  minimalHit: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  minimalPlate: {
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.35,
        shadowRadius: 2.5,
      },
      android: { elevation: 5 },
      default: {},
    }),
  },
  /** Light halo so the blue car stays legible on dark map tiles. */
  minimalIconCrisp: {
    textShadowColor: "rgba(255,255,255,0.9)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 2,
  },
  hit: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  glow: {
    position: "absolute",
    width: RING_SIZE + 14,
    height: RING_SIZE + 14,
    borderRadius: (RING_SIZE + 14) / 2,
    backgroundColor: GLOW,
  },
  directionWrapper: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  cone: {
    position: "absolute",
    top: 6,
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderBottomWidth: 16,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: NAV_RING,
    opacity: 0.32,
  },
  ring: {
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: RING_BORDER,
    borderColor: NAV_RING,
    backgroundColor: "rgba(255,255,255,0.98)",
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.32,
        shadowRadius: 4,
      },
      android: {
        elevation: 6,
      },
      default: {},
    }),
  },
  fill: {
    width: FILL_SIZE,
    height: FILL_SIZE,
    borderRadius: FILL_SIZE / 2,
    backgroundColor: NAV_FILL,
    alignItems: "center",
    justifyContent: "center",
  },
});
