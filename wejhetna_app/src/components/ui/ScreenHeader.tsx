import React from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useTranslation } from "react-i18next";
import { Colors, Radius, Shadow, Spacing, Typography } from "../../theme";

/**
 * Reusable screen header matching the app's polished design language:
 *  - circular back button on a clean surface
 *  - centered, bold title
 *  - optional right-hand action slot
 *
 * Adopt this on any screen that used to render a custom header — it keeps
 * spacing, typography, and back-button treatment consistent across the app.
 */
export type ScreenHeaderProps = {
  title?: string;
  /** Override the default back handler (navigation.goBack). */
  onBack?: () => void;
  /** Hide the back button entirely. */
  hideBack?: boolean;
  /** Optional right-side slot (e.g. a settings / more button). */
  right?: React.ReactNode;
  /** Optional subtitle rendered under the title. */
  subtitle?: string;
  style?: ViewStyle | ViewStyle[];
};

export function ScreenHeader({
  title,
  onBack,
  hideBack,
  right,
  subtitle,
  style,
}: ScreenHeaderProps) {
  const { t } = useTranslation();
  return (
    <View style={[styles.header, style as ViewStyle]}>
      {hideBack ? (
        <View style={styles.sideSlot} />
      ) : (
        <TouchableOpacity
          style={styles.backBtn}
          onPress={onBack}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={t("back") || "Back"}
          activeOpacity={0.8}
        >
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
        </TouchableOpacity>
      )}

      <View style={styles.titleWrap}>
        {title ? (
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        ) : null}
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      <View style={styles.sideSlot}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
    backgroundColor: Colors.bg,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.soft,
  },
  sideSlot: {
    width: 40,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  titleWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: Typography.sizeXl,
    fontWeight: Typography.weightHeavy,
    color: Colors.text,
    textAlign: "center",
  },
  subtitle: {
    marginTop: 2,
    fontSize: Typography.sizeSm,
    color: Colors.textSecondary,
    textAlign: "center",
  },
});

export default ScreenHeader;
