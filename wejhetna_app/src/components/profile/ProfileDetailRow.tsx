import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { Colors, Radius, Spacing, Typography } from "../../theme";

/**
 * A clean, label-over-value row for personal/business/vehicle information
 * inside a `ProfileSection`. Optional left icon chip + optional trailing slot
 * (e.g. an "Edit" pill, a tag, or any custom node).
 *
 * Long values can be allowed to wrap by passing `multiline`. Below the
 * value, a custom child block can be rendered (e.g. inline edit forms,
 * images) without breaking the row's hierarchy.
 */
export type ProfileDetailRowProps = {
  label: string;
  value?: string | null;
  icon?: string;
  multiline?: boolean;
  /** Right-side adornment, e.g. an Edit button. */
  trailing?: React.ReactNode;
  /** Optional content rendered under the value (forms, images, etc.). */
  children?: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
};

export function ProfileDetailRow({
  label,
  value,
  icon,
  multiline = false,
  trailing,
  children,
  style,
}: ProfileDetailRowProps) {
  return (
    <View style={[styles.row, style as ViewStyle]}>
      {icon ? (
        <View style={styles.iconChip}>
          <Ionicons name={icon as any} size={16} color={Colors.textSecondary} />
        </View>
      ) : null}

      <View style={styles.body}>
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>

        <View style={styles.valueRow}>
          {value !== undefined && value !== null ? (
            <Text
              style={styles.value}
              numberOfLines={multiline ? undefined : 1}
            >
              {value}
            </Text>
          ) : (
            <View style={styles.valueFiller} />
          )}
          {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
        </View>

        {children ? <View style={styles.extras}>{children}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.sm + 2,
    backgroundColor: Colors.surfaceMuted,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  iconChip: {
    width: 28,
    height: 28,
    borderRadius: Radius.md - 2,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontSize: 11,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: Colors.textMuted,
    fontWeight: Typography.weightBold,
  },
  valueRow: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  value: {
    flex: 1,
    fontSize: Typography.sizeBase + 1,
    color: Colors.text,
    fontWeight: Typography.weightSemibold,
  },
  valueFiller: { flex: 1 },
  trailing: {
    flexShrink: 0,
  },
  extras: {
    marginTop: Spacing.sm,
  },
});

export default ProfileDetailRow;
