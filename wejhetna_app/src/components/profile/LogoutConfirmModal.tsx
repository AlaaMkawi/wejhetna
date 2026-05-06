import React, { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useTranslation } from "react-i18next";
import { Colors, Radius, Shadow, Spacing, Typography } from "../../theme";

/**
 * Polished logout confirmation modal.
 *
 * Replaces the bare `Alert.alert` with a designed dialog that matches the
 * profile-page visual language: white surface, soft amber/teal accents, clear
 * hierarchy, and equal-weight Cancel/Confirm buttons that visually distinguish
 * the destructive action without being alarming.
 *
 * Translations: uses `logout_confirm_title`, `logout_confirm_body`,
 * `logout_confirm_action`, and `logout_cancel`, with safe fallbacks.
 */
export type LogoutConfirmModalProps = {
  visible: boolean;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function LogoutConfirmModal({
  visible,
  loading = false,
  onCancel,
  onConfirm,
}: LogoutConfirmModalProps) {
  const { t } = useTranslation();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      anim.setValue(0);
      Animated.timing(anim, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }, [visible, anim]);

  const scale = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.92, 1],
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={loading ? undefined : onCancel}
      statusBarTranslucent
    >
      <Pressable
        style={styles.overlay}
        onPress={loading ? undefined : onCancel}
      >
        <Animated.View
          style={[
            styles.cardWrap,
            { opacity: anim, transform: [{ scale }] },
          ]}
        >
          <Pressable onPress={() => {}} style={styles.card}>
            <View style={styles.iconWrap}>
              <Ionicons
                name="log-out-outline"
                size={26}
                color={Colors.danger}
              />
            </View>

            <Text style={styles.title}>
              {t("logout_confirm_title") || t("logout") || "Sign out?"}
            </Text>
            <Text style={styles.body}>
              {t("logout_confirm_body") ||
                t("logout_confirmation") ||
                "Are you sure you want to log out?"}
            </Text>

            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.btn, styles.cancelBtn]}
                onPress={onCancel}
                activeOpacity={0.85}
                disabled={loading}
              >
                <Text style={styles.cancelText}>
                  {t("logout_cancel") || t("cancel") || "Cancel"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.btn,
                  styles.confirmBtn,
                  loading && styles.confirmBtnLoading,
                ]}
                onPress={onConfirm}
                activeOpacity={0.85}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={Colors.textInverse} />
                ) : (
                  <Text style={styles.confirmText}>
                    {t("logout_confirm_action") || t("yes") || "Sign out"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xxl,
  },
  cardWrap: {
    width: "100%",
    maxWidth: 360,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xxl,
    paddingTop: Spacing.xxl,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.lg,
    alignItems: "center",
    ...Shadow.float,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.dangerSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: Typography.sizeXl,
    fontWeight: Typography.weightHeavy,
    color: Colors.text,
    textAlign: "center",
    letterSpacing: -0.2,
  },
  body: {
    marginTop: Spacing.sm,
    fontSize: Typography.sizeBase,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  actions: {
    marginTop: Spacing.xl,
    flexDirection: "row",
    alignSelf: "stretch",
    gap: Spacing.md,
  },
  btn: {
    flex: 1,
    height: 48,
    borderRadius: Radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtn: {
    backgroundColor: Colors.surfaceMuted,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cancelText: {
    color: Colors.text,
    fontSize: Typography.sizeBase,
    fontWeight: Typography.weightBold,
  },
  confirmBtn: {
    backgroundColor: Colors.danger,
    ...Shadow.soft,
  },
  confirmBtnLoading: {
    opacity: 0.85,
  },
  confirmText: {
    color: Colors.textInverse,
    fontSize: Typography.sizeBase,
    fontWeight: Typography.weightBold,
  },
});

export default LogoutConfirmModal;
