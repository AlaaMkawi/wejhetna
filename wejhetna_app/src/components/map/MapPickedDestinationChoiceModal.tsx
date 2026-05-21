import React from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useTranslation } from "react-i18next";
import { Colors, Radius, Shadow, Spacing, Typography } from "../../theme";

type Props = {
  visible: boolean;
  onDismiss: () => void;
  onStartNavigation: () => void;
  onRideWithDriver: () => void;
  navigationLoading?: boolean;
  rideWithDriverLoading?: boolean;
  rideWithDriverMuted?: boolean;
};

/**
 * Centered modal after a free map pick (Regular / Business Owner).
 * Full-screen overlay blocks map and chrome; only X dismisses (no backdrop tap).
 */
export function MapPickedDestinationChoiceModal({
  visible,
  onDismiss,
  onStartNavigation,
  onRideWithDriver,
  navigationLoading = false,
  rideWithDriverLoading = false,
  rideWithDriverMuted = false,
}: Props) {
  const { t } = useTranslation();
  const busy = navigationLoading || rideWithDriverLoading;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <View style={styles.root} accessibilityViewIsModal>
        <View style={styles.overlay} pointerEvents="auto" />

        <View style={styles.centerWrap} pointerEvents="box-none">
          <View style={styles.card}>
            <TouchableOpacity
              onPress={onDismiss}
              style={styles.closeBtn}
              hitSlop={14}
              accessibilityRole="button"
              accessibilityLabel={t("close") || "Close"}
              disabled={busy}
            >
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>

            <View style={styles.iconBadge}>
              <Ionicons name="location" size={28} color={Colors.textInverse} />
            </View>

            <Text style={styles.title}>
              {t("map_pick_choice_modal_title")}
            </Text>
            <Text style={styles.body}>{t("map_pick_choice_modal_body")}</Text>

            <TouchableOpacity
              style={[styles.primaryBtn, busy && styles.btnDisabled]}
              onPress={onStartNavigation}
              disabled={busy}
              activeOpacity={0.88}
            >
              {navigationLoading ? (
                <ActivityIndicator color={Colors.textInverse} size="small" />
              ) : (
                <>
                  <Ionicons
                    name="navigate-outline"
                    size={20}
                    color={Colors.textInverse}
                  />
                  <Text style={styles.primaryBtnText}>
                    {t("start_navigation")}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.secondaryBtn,
                rideWithDriverMuted && styles.secondaryBtnMuted,
                busy && styles.btnDisabled,
              ]}
              onPress={onRideWithDriver}
              disabled={busy || rideWithDriverMuted}
              activeOpacity={0.88}
            >
              {rideWithDriverLoading ? (
                <ActivityIndicator color={Colors.primary} size="small" />
              ) : (
                <>
                  <Ionicons
                    name="car-sport"
                    size={20}
                    color={rideWithDriverMuted ? Colors.textMuted : Colors.primary}
                  />
                  <Text
                    style={[
                      styles.secondaryBtnText,
                      rideWithDriverMuted && styles.secondaryBtnTextMuted,
                    ]}
                  >
                    {t("ride_with_driver_button")}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.overlay,
  },
  centerWrap: {
    width: "100%",
    maxWidth: 360,
    paddingHorizontal: Spacing.xl,
    alignItems: "center",
  },
  card: {
    width: "100%",
    backgroundColor: Colors.surface,
    borderRadius: Radius.xxl,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.xl,
    alignItems: "center",
    ...Shadow.float,
    ...Platform.select({
      android: { elevation: 12 },
      default: {},
    }),
  },
  closeBtn: {
    position: "absolute",
    top: Spacing.md,
    right: Spacing.md,
    zIndex: 2,
    padding: Spacing.xs,
  },
  iconBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: Typography.sizeXl,
    fontWeight: Typography.weightBold,
    color: Colors.text,
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  body: {
    fontSize: Typography.sizeBase,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: Typography.lineBody,
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.sm,
  },
  primaryBtn: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md + 2,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  primaryBtnText: {
    color: Colors.textInverse,
    fontSize: Typography.sizeLg,
    fontWeight: Typography.weightBold,
  },
  secondaryBtn: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 2,
    borderColor: Colors.primary,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  secondaryBtnMuted: {
    borderColor: Colors.borderStrong,
  },
  secondaryBtnText: {
    color: Colors.primary,
    fontSize: Typography.sizeLg,
    fontWeight: Typography.weightBold,
  },
  secondaryBtnTextMuted: {
    color: Colors.textMuted,
  },
  btnDisabled: {
    opacity: 0.65,
  },
});

export default MapPickedDestinationChoiceModal;
