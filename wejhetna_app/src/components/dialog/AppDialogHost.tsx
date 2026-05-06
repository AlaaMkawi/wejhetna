import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Easing,
  I18nManager,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { popAppDialog, useAppDialogQueue, type AppAlertButton } from "../../utils/appAlert";
import { Colors, Radius, Shadow, Spacing, Typography } from "../../theme";

/**
 * Mount once at the app root. Renders queued `appAlert` dialogs with brand styling.
 */
export default function AppDialogHost() {
  const queue = useAppDialogQueue();
  const current = queue[0];
  const visible = current != null;
  const anim = useRef(new Animated.Value(0)).current;
  const { height: winH } = useWindowDimensions();

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
  }, [visible, current, anim]);

  const scale = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.94, 1],
  });

  const iconMeta = useMemo(() => {
    if (!current) return { name: "information-circle-outline" as const, bg: Colors.primarySoft, fg: Colors.primary };
    const hasDestructive = current.buttons.some((b) => b.style === "destructive");
    if (hasDestructive) {
      return { name: "alert-circle-outline" as const, bg: Colors.dangerSoft, fg: Colors.danger };
    }
    return { name: "information-circle-outline" as const, bg: Colors.primarySoft, fg: Colors.primary };
  }, [current]);

  const maxMessageH = Math.min(240, Math.round(winH * 0.38));

  const onBackdrop = useCallback(() => {
    if (!current) return;
    const cancelable = current.options?.cancelable !== false;
    if (!cancelable) return;
    current.options?.onDismiss?.();
    popAppDialog();
  }, [current]);

  const onButton = useCallback((b: AppAlertButton) => {
    try {
      b.onPress?.();
    } finally {
      popAppDialog();
    }
  }, []);

  if (!current) return null;

  const cancelable = current.options?.cancelable !== false;
  const btns = current.buttons;
  const useColumn = btns.length > 2;
  const rtl = I18nManager.isRTL;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={cancelable ? onBackdrop : undefined}
    >
      <Pressable style={styles.overlay} onPress={onBackdrop}>
        <Animated.View
          style={[
            styles.cardWrap,
            { opacity: anim, transform: [{ scale }] },
          ]}
        >
          <Pressable onPress={() => {}} style={styles.card}>
            <View style={styles.iconRow}>
              <View style={[styles.iconCircle, { backgroundColor: iconMeta.bg }]}>
                <Ionicons name={iconMeta.name} size={26} color={iconMeta.fg} />
              </View>
              <Text style={styles.title} accessibilityRole="header">
                {current.title}
              </Text>
            </View>

            {current.message ? (
              <ScrollView
                style={{ maxHeight: maxMessageH }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator
              >
                <Text style={styles.message}>{current.message}</Text>
              </ScrollView>
            ) : null}

            <View
              style={[
                styles.actions,
                useColumn && styles.actionsColumn,
                !useColumn && {
                  flexDirection: rtl ? "row-reverse" : "row",
                },
              ]}
            >
              {btns.map((b, i) => (
                <TouchableOpacity
                  key={`${b.text ?? "b"}-${i}`}
                  style={[
                    styles.btn,
                    useColumn ? styles.btnColumn : styles.btnRow,
                    buttonVisual(b.style),
                  ]}
                  onPress={() => onButton(b)}
                  activeOpacity={0.88}
                >
                  <Text style={buttonTextStyle(b.style)}>{b.text ?? "OK"}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

function buttonVisual(style?: AppAlertButton["style"]) {
  switch (style) {
    case "cancel":
      return styles.btnCancel;
    case "destructive":
      return styles.btnDestructive;
    default:
      return styles.btnDefault;
  }
}

function buttonTextStyle(
  style?: AppAlertButton["style"]
): typeof styles.btnTextInverse | typeof styles.btnTextCancel {
  return style === "cancel" ? styles.btnTextCancel : styles.btnTextInverse;
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
    paddingTop: Spacing.xl,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.lg,
    ...Shadow.float,
  },
  iconRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
    gap: Spacing.md,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    fontSize: Typography.sizeLg,
    fontWeight: Typography.weightHeavy,
    color: Colors.text,
    letterSpacing: -0.2,
  },
  message: {
    fontSize: Typography.sizeBase,
    color: Colors.textSecondary,
    lineHeight: Typography.lineBody,
    marginBottom: Spacing.md,
  },
  actions: {
    marginTop: Spacing.md,
    gap: Spacing.md,
    alignSelf: "stretch",
  },
  actionsColumn: {
    flexDirection: "column",
  },
  btnRow: {
    flex: 1,
    minHeight: 48,
    borderRadius: Radius.lg,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.sm,
  },
  btnColumn: {
    minHeight: 48,
    borderRadius: Radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  btn: {
    ...Shadow.soft,
  },
  btnDefault: {
    backgroundColor: Colors.primary,
  },
  btnCancel: {
    backgroundColor: Colors.surfaceMuted,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.none,
  },
  btnDestructive: {
    backgroundColor: Colors.danger,
  },
  btnTextInverse: {
    color: Colors.textInverse,
    fontSize: Typography.sizeBase,
    fontWeight: Typography.weightBold,
  },
  btnTextCancel: {
    color: Colors.text,
    fontSize: Typography.sizeBase,
    fontWeight: Typography.weightBold,
  },
});

export { appAlert } from "../../utils/appAlert";
