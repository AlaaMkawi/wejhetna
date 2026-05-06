import React, { useEffect, useRef } from "react";
import { Animated, Easing, Platform, StyleSheet, View } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";

/**
 * Yellow taxi pin used while a passenger is choosing a nearby driver on the map.
 *
 * Visual design notes:
 *  - The body is a teardrop pin (Ionicons "location") in a warm taxi yellow,
 *    so the marker reads instantly as a "spot on the map" instead of a generic
 *    icon. An inner white plate hosts the taxi glyph for clear iconography
 *    against busy map tiles.
 *  - Selected drivers grow slightly and gain an animated soft-pulse ring +
 *    accent outline so the user can see which marker is the source of the
 *    open info popup at a glance.
 *  - This component is intentionally different from `RideDriverMapMarker`
 *    (used during live ride tracking, where the car rotates with heading).
 *
 * Anchoring:
 *  - The wrapper is sized exactly to the pin glyph and the visible tip sits
 *    at the bottom edge of the View. Pair with `anchor={{ x: 0.5, y: 1 }}`
 *    on the parent `PointAnnotation` so the tip lands on the GPS coordinate.
 */

const TAXI_YELLOW = "#facc15";
const TAXI_YELLOW_DEEP = "#eab308";
const TAXI_DARK = "#1f2937";
const ACCENT = "#f59e0b";
const PLATE_BG = "#ffffff";

export type NearbyDriverTaxiMarkerSize = "compact" | "expanded";

export type NearbyDriverTaxiMarkerProps = {
  /** When true, renders the slightly enlarged variant used for the currently-selected driver. */
  selected?: boolean;
  size?: NearbyDriverTaxiMarkerSize;
};

const SIZE_MAP: Record<
  NearbyDriverTaxiMarkerSize,
  { pin: number; plate: number; icon: number }
> = {
  compact: { pin: 46, plate: 24, icon: 14 },
  expanded: { pin: 54, plate: 28, icon: 17 },
};

export function NearbyDriverTaxiMarker({
  selected = false,
  size,
}: NearbyDriverTaxiMarkerProps) {
  const resolvedSize: NearbyDriverTaxiMarkerSize =
    size ?? (selected ? "expanded" : "compact");
  const { pin, plate, icon } = SIZE_MAP[resolvedSize];

  // Soft pulse ring on the selected marker — purely cosmetic, communicates
  // "this is the active driver" without obscuring nearby markers.
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!selected) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 2200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [selected, pulse]);

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] });
  const ringSize = pin * 0.62;

  // Plate position: visually inside the upper bulb of the teardrop. Ionicons'
  // "location" glyph centers its bulb at roughly 35-40% from the top.
  const plateTop = pin * 0.16;
  const bulbCenterY = plateTop + plate / 2;

  return (
    <View
      style={[
        styles.hit,
        // Wrapper sized to the pin glyph; bottom edge ≈ tip of the pin so
        // anchor (0.5, 1) lands the visual tip on the coordinate.
        { width: pin, height: pin },
      ]}
    >
      {selected ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pulseRing,
            {
              width: ringSize,
              height: ringSize,
              borderRadius: ringSize / 2,
              top: bulbCenterY - ringSize / 2,
              left: pin / 2 - ringSize / 2,
              transform: [{ scale: ringScale }],
              opacity: ringOpacity,
            },
          ]}
        />
      ) : null}

      <View style={styles.shadowPlate}>
        <Ionicons
          name="location"
          size={pin}
          color={selected ? TAXI_YELLOW_DEEP : TAXI_YELLOW}
          style={styles.pin}
        />
        {/* Subtle inner stroke — gives the yellow pin a crisp white edge so
            it stands out against busy map tiles without looking heavy. */}
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
              borderColor: selected ? ACCENT : "rgba(255,255,255,0.85)",
              borderWidth: selected ? 2 : 1.25,
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
          <MaterialCommunityIcons name="taxi" size={icon} color={TAXI_DARK} />
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
  pulseRing: {
    position: "absolute",
    backgroundColor: "rgba(250, 204, 21, 0.45)",
  },
});

export default NearbyDriverTaxiMarker;
