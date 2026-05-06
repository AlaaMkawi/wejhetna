import React, { useState } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { Colors, Radius, Shadow, Spacing, Typography } from "../../theme";

/**
 * Section card used to group related rows on the profile pages.
 *
 * Replaces the legacy `Accordion` with a polished design-system version:
 *  - white surface, soft shadow, rounded corners, subtle border
 *  - tinted icon chip + title + optional caption
 *  - chevron rotates on open/close
 *
 * Always collapsible — pass `defaultOpen={true}` for sections you want
 * expanded on first render (e.g. "Personal information").
 */
export type ProfileSectionProps = {
  title: string;
  icon?: string;
  caption?: string;
  /** Optional right-side trailing content (e.g. status tag). */
  trailing?: React.ReactNode;
  defaultOpen?: boolean;
  /** Hide chevron / make non-collapsible. */
  staticOpen?: boolean;
  children?: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
};

export function ProfileSection({
  title,
  icon,
  caption,
  trailing,
  defaultOpen = false,
  staticOpen = false,
  children,
  style,
}: ProfileSectionProps) {
  const [open, setOpen] = useState(defaultOpen || staticOpen);
  const rotate = React.useRef(
    new Animated.Value(defaultOpen || staticOpen ? 1 : 0),
  ).current;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    Animated.timing(rotate, {
      toValue: next ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  const chevronRotation = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });

  return (
    <View style={[styles.card, style as ViewStyle]}>
      <TouchableOpacity
        style={styles.header}
        onPress={staticOpen ? undefined : toggle}
        activeOpacity={staticOpen ? 1 : 0.7}
        disabled={staticOpen}
      >
        {icon ? (
          <View style={styles.iconChip}>
            <Ionicons name={icon as any} size={18} color={Colors.primary} />
          </View>
        ) : null}

        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {caption ? (
            <Text style={styles.caption} numberOfLines={1}>
              {caption}
            </Text>
          ) : null}
        </View>

        {trailing}

        {!staticOpen ? (
          <Animated.View style={{ transform: [{ rotate: chevronRotation }] }}>
            <Ionicons name="chevron-down" size={20} color={Colors.textMuted} />
          </Animated.View>
        ) : null}
      </TouchableOpacity>

      {open ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xxl,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.soft,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  iconChip: {
    width: 38,
    height: 38,
    borderRadius: Radius.md + 2,
    backgroundColor: Colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: Typography.sizeMd,
    fontWeight: Typography.weightBold,
    color: Colors.text,
    letterSpacing: -0.1,
  },
  caption: {
    marginTop: 2,
    fontSize: Typography.sizeSm,
    color: Colors.textMuted,
  },
  body: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    paddingTop: Spacing.xs,
    gap: Spacing.sm,
  },
});

export default ProfileSection;
