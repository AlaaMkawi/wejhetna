import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { Colors, Radius, Spacing, Typography } from "../../theme";

export type EmptyStateProps = {
  icon?: string;
  title?: string;
  message: string;
  style?: ViewStyle | ViewStyle[];
};

/**
 * Consistent placeholder for empty lists / no-results states.
 * Uses the muted palette so it stays calm even on visually dense screens.
 */
export function EmptyState({ icon, title, message, style }: EmptyStateProps) {
  return (
    <View style={[styles.wrap, style as ViewStyle]}>
      {icon ? (
        <View style={styles.iconWrap}>
          <Ionicons name={icon as any} size={22} color={Colors.textMuted} />
        </View>
      ) : null}
      {title ? <Text style={styles.title}>{title}</Text> : null}
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.xxxl,
    paddingHorizontal: Spacing.xl,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceMuted,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: Typography.sizeMd,
    fontWeight: Typography.weightBold,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  message: {
    fontSize: Typography.sizeSm,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: Typography.lineBody,
  },
});

export default EmptyState;
