import React, { memo, useEffect, useRef } from "react";
import { Animated, Easing, Platform, StyleSheet, View } from "react-native";
import { getUserDotScale } from "./markerScale";

export type UserLocationDotProps = {
  /** Current map zoom (already quantized — see `quantizeZoomForMarkers`). */
  zoom: number;
  /** Optional brand color override. Defaults to the app's brand teal. */
  color?: string;
};

const BRAND = "#0f5b63";

/**
 * Reusable "you are here" dot used outside of active turn-by-turn navigation
 * (the in-nav variant lives in `NavigationMarker.tsx` and adds heading + cone).
 *
 * Visual hierarchy:
 *   - Soft ambient pulse halo (looped Animated, native driver, opacity-driven).
 *   - White ring on a brand-teal core — same family as `RouteEndpointMarker` so the
 *     marker family across the app reads as one design system.
 *
 * Always rendered with `pointerEvents="none"` so it never steals taps from real
 * place markers / clickable overlays. Callers should still render it *last* in the
 * map's child order so it sits above place pins (z-order).
 */
function UserLocationDotInner({ zoom, color = BRAND }: UserLocationDotProps) {
  const pulse = useRef(new Animated.Value(0)).current;
  const zoomScale = getUserDotScale(zoom);
  const useStaticMarker = Platform.OS === "ios";

  useEffect(() => {
    if (useStaticMarker) {
      return;
    }
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1600,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [pulse, useStaticMarker]);

  const pulseScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 2.4],
  });
  const pulseOpacity = pulse.interpolate({
    inputRange: [0, 0.15, 1],
    outputRange: [0.0, 0.45, 0.0],
  });

  return (
    <View style={styles.hit} pointerEvents="none" collapsable={false}>
      <View style={[styles.core, { transform: [{ scale: zoomScale }] }]}>
        {useStaticMarker ? (
          <View
            style={[
              styles.pulse,
              { backgroundColor: color, opacity: 0.22, transform: [{ scale: 1.8 }] },
            ]}
          />
        ) : (
          <Animated.View
            style={[
              styles.pulse,
              {
                backgroundColor: color,
                opacity: pulseOpacity,
                transform: [{ scale: pulseScale }],
              },
            ]}
          />
        )}
        <View style={[styles.outerRing, { backgroundColor: "#FFFFFF" }]}>
          <View style={[styles.innerDot, { backgroundColor: color }]} />
        </View>
      </View>
    </View>
  );
}

function arePropsEqual(a: UserLocationDotProps, b: UserLocationDotProps): boolean {
  return a.zoom === b.zoom && a.color === b.color;
}

export const UserLocationDot = memo(UserLocationDotInner, arePropsEqual);

const OUTER = 22;
const INNER = 12;
const PULSE = OUTER;

const styles = StyleSheet.create({
  hit: {
    width: OUTER * 3,
    height: OUTER * 3,
    alignItems: "center",
    justifyContent: "center",
  },
  core: {
    width: OUTER * 3,
    height: OUTER * 3,
    alignItems: "center",
    justifyContent: "center",
  },
  pulse: {
    position: "absolute",
    width: PULSE,
    height: PULSE,
    borderRadius: PULSE / 2,
  },
  outerRing: {
    width: OUTER,
    height: OUTER,
    borderRadius: OUTER / 2,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.28,
        shadowRadius: 4,
      },
      android: {
        elevation: 6,
      },
      default: {},
    }),
  },
  innerDot: {
    width: INNER,
    height: INNER,
    borderRadius: INNER / 2,
  },
});

export default UserLocationDot;
