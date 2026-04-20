import React, { useEffect } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";

const TEAL = "#0f5b63";
const SUCCESS_MS = 5000;

type Props = {
  visible: boolean;
  /** Fires once after 5 seconds while visible (then parent should hide + navigate). */
  onTimerComplete: () => void;
  title: string;
  body: string;
};

/**
 * Shown after correct OTP on driver/passenger requests screens: 5s overlay, then parent navigates to trip.
 */
export function RideVerifySuccessModal({ visible, onTimerComplete, title, body }: Props) {
  useEffect(() => {
    if (!visible) return;
    const id = setTimeout(() => onTimerComplete(), SUCCESS_MS);
    return () => clearTimeout(id);
  }, [visible, onTimerComplete]);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 22,
    width: "100%",
    maxWidth: 360,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  title: { fontSize: 20, fontWeight: "800", color: TEAL, textAlign: "center", marginBottom: 10 },
  body: { fontSize: 16, color: "#333", textAlign: "center", lineHeight: 24 },
});
