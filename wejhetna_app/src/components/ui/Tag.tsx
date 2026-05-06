import React from "react";
import { StyleSheet, Text, TextStyle, View, ViewStyle } from "react-native";
import { Colors, Radius, Spacing, Typography } from "../../theme";
import type { StatusTone } from "./StatusDot";

/**
 * Compact pill tag used for status labels (e.g. "Approved", "Pending").
 * Pairs a tinted background with a matching bold label for quick scanning.
 */
export type TagProps = {
  tone?: StatusTone;
  label: string;
  style?: ViewStyle | ViewStyle[];
  textStyle?: TextStyle | TextStyle[];
};

const TONE_STYLES: Record<StatusTone, { bg: string; fg: string }> = {
  success: { bg: Colors.successSoft, fg: Colors.success },
  warning: { bg: Colors.warningSoft, fg: Colors.warning },
  danger: { bg: Colors.dangerSoft, fg: Colors.danger },
  info: { bg: Colors.infoSoft, fg: Colors.info },
  primary: { bg: Colors.primarySoft, fg: Colors.primary },
  accent: { bg: Colors.accentSoft, fg: Colors.accent },
  neutral: { bg: Colors.surfaceMuted, fg: Colors.textSecondary },
};

export function Tag({ tone = "neutral", label, style, textStyle }: TagProps) {
  const tones = TONE_STYLES[tone];
  return (
    <View
      style={[
        styles.base,
        { backgroundColor: tones.bg },
        style as ViewStyle,
      ]}
    >
      <Text style={[styles.text, { color: tones.fg }, textStyle as TextStyle]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  text: {
    fontSize: Typography.sizeXs,
    fontWeight: Typography.weightBold,
    letterSpacing: 0.2,
  },
});

export default Tag;
