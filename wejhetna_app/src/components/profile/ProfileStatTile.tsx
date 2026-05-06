import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { Colors, Radius, Shadow, Spacing, Typography } from "../../theme";
import type { StatusTone } from "../ui/StatusDot";

/**
 * Compact stat tile used in a row of quick info cards on the profile page.
 *
 * Each tile is a soft white card with:
 *  - a tinted icon chip (tone-driven, defaults to primary)
 *  - a small uppercase label
 *  - a bold value, with an optional dimmed subtitle
 *
 * Designed to look balanced 1, 2, or 3 across — pair with `flex: 1` parents.
 */
export type ProfileStatTileProps = {
  label: string;
  value: string;
  subtitle?: string;
  icon?: string;
  tone?: StatusTone;
};

const TONE_BG: Record<StatusTone, string> = {
  primary: Colors.primarySoft,
  accent: Colors.accentSoft,
  success: Colors.successSoft,
  warning: Colors.warningSoft,
  danger: Colors.dangerSoft,
  info: Colors.infoSoft,
  neutral: Colors.surfaceMuted,
};

const TONE_FG: Record<StatusTone, string> = {
  primary: Colors.primary,
  accent: Colors.accent,
  success: Colors.success,
  warning: Colors.warning,
  danger: Colors.danger,
  info: Colors.info,
  neutral: Colors.textSecondary,
};

export function ProfileStatTile({
  label,
  value,
  subtitle,
  icon,
  tone = "primary",
}: ProfileStatTileProps) {
  return (
    <View style={styles.tile}>
      {icon ? (
        <View style={[styles.iconChip, { backgroundColor: TONE_BG[tone] }]}>
          <Ionicons name={icon as any} size={16} color={TONE_FG[tone]} />
        </View>
      ) : null}
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.value} numberOfLines={1}>
        {value}
      </Text>
      {subtitle ? (
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minWidth: 0,
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.md + 2,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.soft,
    gap: 4,
  },
  iconChip: {
    width: 30,
    height: 30,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xs,
  },
  label: {
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: Colors.textMuted,
    fontWeight: Typography.weightBold,
  },
  value: {
    marginTop: 2,
    fontSize: Typography.sizeLg,
    fontWeight: Typography.weightHeavy,
    color: Colors.text,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: Typography.sizeSm,
    color: Colors.textSecondary,
  },
});

export default ProfileStatTile;
