import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { Colors } from "../../theme";
import { mapMarkerStyles, MARKER_BORDER, MARKER_SURFACE } from "./mapMarkerTheme";

const BRAND = Colors.primary;

export type PlaceClusterMarkerProps = {
  count: number;
  emphasized?: boolean;
  accessibilityLabel?: string;
  onPress?: () => void;
};

/**
 * Premium cluster badge: white halo + teal core + soft shadow.
 * Parent `PointAnnotation` uses `anchor={{ x: 0.5, y: 0.5 }}`.
 */
export function PlaceClusterMarker({
  count,
  emphasized = false,
  accessibilityLabel,
  onPress,
}: PlaceClusterMarkerProps) {
  const outer = emphasized ? 48 : 44;
  const inner = emphasized ? 36 : 32;
  const label = count > 99 ? "99+" : String(count);

  const body = (
    <View
      style={[styles.hit, { width: outer, height: outer }]}
      collapsable={false}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <View
        style={[
          styles.halo,
          mapMarkerStyles.floatShadow,
          emphasized ? mapMarkerStyles.floatShadowSelected : null,
          {
            width: outer,
            height: outer,
            borderRadius: outer / 2,
          },
        ]}
      >
        <View
          style={[
            styles.core,
            {
              width: inner,
              height: inner,
              borderRadius: inner / 2,
            },
            emphasized ? styles.coreEmphasized : null,
          ]}
        >
          <Ionicons
            name="layers-outline"
            size={emphasized ? 14 : 12}
            color="rgba(255,255,255,0.85)"
            style={styles.layersIcon}
          />
          <Text style={[styles.count, emphasized ? styles.countEmphasized : null]}>
            {label}
          </Text>
        </View>
      </View>
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} hitSlop={6}>
        {body}
      </Pressable>
    );
  }
  return body;
}

const styles = StyleSheet.create({
  hit: {
    alignItems: "center",
    justifyContent: "center",
  },
  halo: {
    backgroundColor: MARKER_SURFACE,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: MARKER_BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  core: {
    backgroundColor: BRAND,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 2,
  },
  coreEmphasized: {
    backgroundColor: Colors.primaryDark,
  },
  layersIcon: {
    marginBottom: -2,
    opacity: 0.9,
  },
  count: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 13,
    letterSpacing: -0.3,
  },
  countEmphasized: {
    fontSize: 14,
  },
});

export default PlaceClusterMarker;
