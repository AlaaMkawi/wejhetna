import React from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { Colors, Radius, Shadow, Spacing, Typography } from "../../theme";
import type { StatusTone } from "../ui/StatusDot";

/**
 * Tappable shortcut card used for profile-page actions:
 * "Saved places", "Add city" (admin), "Request advertisement", etc.
 *
 * Design: white card surface, tinted icon chip on the leading side, title +
 * subtitle stacked, chevron on the trailing side. Two visual variants
 * available — `subtle` (the default) and `prominent` (filled icon background
 * for primary CTAs).
 */
export type ProfileShortcutCardProps = {
  title: string;
  subtitle?: string;
  icon: string;
  tone?: StatusTone;
  variant?: "subtle" | "prominent";
  isRTL?: boolean;
  onPress?: () => void;
  style?: ViewStyle | ViewStyle[];
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

const TONE_FILLED: Record<StatusTone, string> = {
  primary: Colors.primary,
  accent: Colors.accent,
  success: Colors.success,
  warning: Colors.warning,
  danger: Colors.danger,
  info: Colors.info,
  neutral: Colors.textSecondary,
};

export function ProfileShortcutCard({
  title,
  subtitle,
  icon,
  tone = "primary",
  variant = "subtle",
  isRTL = false,
  onPress,
  style,
}: ProfileShortcutCardProps) {
  const filled = variant === "prominent";
  return (
    <TouchableOpacity
      style={[
        styles.card,
        isRTL && styles.cardRTL,
        style as ViewStyle,
      ]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
    >
      <View
        style={[
          styles.iconChip,
          {
            backgroundColor: filled ? TONE_FILLED[tone] : TONE_BG[tone],
          },
        ]}
      >
        <Ionicons
          name={icon as any}
          size={20}
          color={filled ? Colors.textInverse : TONE_FG[tone]}
        />
      </View>

      <View style={styles.body}>
        <Text
          style={[styles.title, isRTL && styles.rtlText]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={[styles.subtitle, isRTL && styles.rtlText]}
            numberOfLines={2}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>

      <Ionicons
        name={isRTL ? "chevron-back" : "chevron-forward"}
        size={20}
        color={Colors.textMuted}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    paddingVertical: Spacing.md + 2,
    paddingHorizontal: Spacing.md + 2,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.soft,
  },
  cardRTL: {
    flexDirection: "row-reverse",
  },
  iconChip: {
    width: 42,
    height: 42,
    borderRadius: Radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: Typography.sizeMd,
    fontWeight: Typography.weightBold,
    color: Colors.text,
    letterSpacing: -0.1,
  },
  subtitle: {
    marginTop: 2,
    fontSize: Typography.sizeSm,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  rtlText: {
    textAlign: "right",
    writingDirection: "rtl",
  },
});

export default ProfileShortcutCard;
