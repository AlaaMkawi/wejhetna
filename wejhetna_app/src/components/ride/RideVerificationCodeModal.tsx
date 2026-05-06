import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useTranslation } from "react-i18next";
import { Colors, Radius, Shadow, Spacing, Typography } from "../../theme";
import { RideVerificationAttemptHint } from "./RideVerificationAttemptHint";

/**
 * Polished 6-digit verification-code modal used by the driver to confirm
 * pickup of a passenger.
 *
 * Design language matches the new profile / advertisement modals:
 *  - Soft white surface with rounded corners and a float shadow.
 *  - Round soft-tinted icon, clear title hierarchy, calm body copy.
 *  - PIN-style boxes (one per digit) with an accent active-cell border.
 *  - Equal-weight Cancel/Confirm action row matching the logout dialog.
 *
 * Behavior notes:
 *  - The visible boxes are presentation only; a single hidden `TextInput`
 *    handles all input (enables paste, IME, and autofill suggestions).
 *  - Tapping anywhere on the cells re-focuses that hidden input.
 *  - When `length` digits are entered, Confirm is enabled and pressing
 *    Done on the keyboard auto-submits.
 *  - All submission/verify logic stays in the parent — this component just
 *    collects the code and emits `onSubmit(code)`.
 */
export type RideVerificationCodeModalProps = {
  visible: boolean;
  loading?: boolean;
  /** Number of digit cells. Defaults to 6 to match the current OTP format. */
  length?: number;
  /** Number of failed verification attempts so far (0 if none). */
  failedAttempts?: number;
  /** Optional inline error hint (e.g. server rejection message). */
  errorHint?: string | null;
  /**
   * Reset the inputs the next time the modal is opened.
   * Defaults to `true`. Useful for reopening after a wrong-code attempt.
   */
  resetOnOpen?: boolean;
  onClose: () => void;
  onSubmit: (code: string) => void;
};

export function RideVerificationCodeModal({
  visible,
  loading = false,
  length = 6,
  failedAttempts = 0,
  errorHint,
  resetOnOpen = true,
  onClose,
  onSubmit,
}: RideVerificationCodeModalProps) {
  const { t } = useTranslation();
  const [code, setCode] = useState("");
  const inputRef = useRef<TextInput>(null);

  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      if (resetOnOpen) setCode("");
      anim.setValue(0);
      Animated.timing(anim, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      // Slight delay so the modal animation finishes before the keyboard
      // pops up — feels less jarring on slower devices.
      const t1 = setTimeout(() => inputRef.current?.focus(), 220);
      return () => clearTimeout(t1);
    }
  }, [visible, resetOnOpen, anim]);

  const scale = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.92, 1],
  });

  const cells = useMemo(() => Array.from({ length }), [length]);
  const isComplete = code.length >= length;

  const handleChange = (text: string) => {
    // Strip non-digits and clamp — handles paste of "123 456" or similar too.
    const cleaned = text.replace(/\D/g, "").slice(0, length);
    setCode(cleaned);
  };

  const submit = () => {
    if (loading) return;
    const trimmed = code.trim();
    if (trimmed.length === 0) return;
    onSubmit(trimmed);
  };

  const focusInput = () => {
    if (loading) return;
    inputRef.current?.focus();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={loading ? undefined : onClose}
      statusBarTranslucent
    >
      <Pressable
        style={styles.overlay}
        onPress={loading ? undefined : onClose}
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
                name="shield-checkmark-outline"
                size={26}
                color={Colors.primary}
              />
            </View>

            <Text style={styles.title}>
              {t("ride_verify_modal_title") ||
                t("ride_confirm_code") ||
                "Verify ride"}
            </Text>
            <Text style={styles.body}>
              {t("ride_verify_modal_body", { count: length }) ||
                t("ride_driver_tracking_phase_arrived_otp") ||
                "Ask the passenger for the verification code shown on their screen."}
            </Text>

            <Pressable
              onPress={focusInput}
              style={styles.cellsRow}
              accessibilityRole="button"
              accessibilityLabel={
                t("ride_verify_code_placeholder") || "Verification code"
              }
            >
              {cells.map((_, i) => {
                const char = code[i] ?? "";
                const isActive = i === code.length && !isComplete;
                const isFilled = !!char;
                return (
                  <View
                    key={i}
                    style={[
                      styles.cell,
                      isFilled && styles.cellFilled,
                      isActive && styles.cellActive,
                    ]}
                  >
                    <Text style={styles.cellText} allowFontScaling={false}>
                      {char}
                    </Text>
                  </View>
                );
              })}
            </Pressable>

            {/* The functional input is rendered behind the cells but kept
                practically invisible. We intentionally keep it in the layout
                (rather than `display: none`) so focus / paste / suggestions
                continue to work reliably across iOS and Android. */}
            <TextInput
              ref={inputRef}
              value={code}
              onChangeText={handleChange}
              onSubmitEditing={submit}
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={length}
              editable={!loading}
              style={styles.hiddenInput}
              autoCorrect={false}
              autoCapitalize="none"
              caretHidden
              textContentType="oneTimeCode"
              importantForAutofill="yes"
              accessibilityLabel={
                t("ride_verify_code_placeholder") || "Verification code"
              }
            />

            <View style={styles.attemptHintWrap}>
              <RideVerificationAttemptHint
                failedAttempts={failedAttempts}
                labelTwoRemaining={t("ride_verify_attempts_two_remaining")}
                labelOneRemaining={t("ride_verify_attempts_one_remaining")}
              />
            </View>

            {errorHint ? (
              <Text style={styles.errorText} numberOfLines={3}>
                {errorHint}
              </Text>
            ) : null}

            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.btn, styles.cancelBtn]}
                onPress={onClose}
                activeOpacity={0.85}
                disabled={loading}
              >
                <Text style={styles.cancelText}>
                  {t("ride_verify_modal_close") ||
                    t("close") ||
                    t("cancel") ||
                    "Close"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.btn,
                  styles.confirmBtn,
                  (!isComplete || loading) && styles.confirmBtnDisabled,
                ]}
                onPress={submit}
                activeOpacity={0.85}
                disabled={!isComplete || loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={Colors.textInverse} />
                ) : (
                  <Text style={styles.confirmText}>
                    {t("ride_confirm_code") || "Confirm"}
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

const CELL_SIZE = 44;
const CELL_GAP = 8;

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
    maxWidth: 380,
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
    backgroundColor: Colors.primarySoft,
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
  cellsRow: {
    marginTop: Spacing.xl,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: CELL_GAP,
    alignSelf: "stretch",
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE + 6,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  cellFilled: {
    backgroundColor: Colors.surface,
    borderColor: Colors.borderStrong,
  },
  cellActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.surface,
    ...Shadow.soft,
  },
  cellText: {
    fontSize: Typography.sizeXl,
    fontWeight: Typography.weightBold,
    color: Colors.text,
    includeFontPadding: false as unknown as boolean,
  },
  hiddenInput: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
    // Keeps the input visually invisible but in the focus/layout tree so
    // paste / autofill continue to work reliably across platforms.
    top: 0,
    left: 0,
  },
  attemptHintWrap: {
    marginTop: Spacing.md,
    alignSelf: "stretch",
  },
  errorText: {
    marginTop: Spacing.xs,
    fontSize: Typography.sizeSm,
    color: Colors.danger,
    textAlign: "center",
  },
  actions: {
    marginTop: Spacing.lg,
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
    backgroundColor: Colors.primary,
    ...Shadow.soft,
  },
  confirmBtnDisabled: {
    opacity: 0.55,
  },
  confirmText: {
    color: Colors.textInverse,
    fontSize: Typography.sizeBase,
    fontWeight: Typography.weightBold,
  },
});

export default RideVerificationCodeModal;
