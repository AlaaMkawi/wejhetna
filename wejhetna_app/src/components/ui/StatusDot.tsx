import React from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import { Colors } from "../../theme";

/**
 * Small colored dot used to indicate a compact state (online / pending / ...).
 * Semantic tone keeps status colors consistent with the rest of the app.
 */
export type StatusTone =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral"
  | "primary"
  | "accent";

const TONE_COLOR: Record<StatusTone, string> = {
  success: Colors.success,
  warning: Colors.warning,
  danger: Colors.danger,
  info: Colors.info,
  neutral: Colors.textMuted,
  primary: Colors.primary,
  accent: Colors.accent,
};

export type StatusDotProps = {
  tone?: StatusTone;
  size?: number;
  style?: ViewStyle | ViewStyle[];
};

export function StatusDot({ tone = "neutral", size = 10, style }: StatusDotProps) {
  return (
    <View
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: TONE_COLOR[tone],
        },
        style as ViewStyle,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: {},
});

export default StatusDot;
