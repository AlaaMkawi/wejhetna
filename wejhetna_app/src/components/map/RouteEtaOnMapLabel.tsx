import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

type Props = {
  label: string;
  accentColor?: string;
};

/**
 * ETA chip rendered on the route polyline during active navigation.
 */
export function RouteEtaOnMapLabel({ label, accentColor = "#4285F4" }: Props) {
  return (
    <View style={styles.hit} pointerEvents="none">
      <View style={[styles.bubble, { borderColor: accentColor }]}>
        <View style={[styles.dot, { backgroundColor: accentColor }]} />
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hit: {
    alignItems: "center",
    justifyContent: "center",
  },
  bubble: {
    flexDirection: "row",
    alignItems: "center",
    maxWidth: 168,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1.5,
    backgroundColor: "#ffffff",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.14,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
      },
      android: { elevation: 4 },
    }),
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 6,
  },
  label: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "700",
    color: "#0f172a",
  },
});
