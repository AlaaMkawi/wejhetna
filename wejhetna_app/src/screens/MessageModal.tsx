// MessageModal.tsx
import React from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";


type Props = {
  visible: boolean;
  type: "error" | "success";
  title: string;
  message: string;
  onClose: () => void;
};

export default function MessageModal({
  visible,
  type,
  title,
  message,
  onClose,
}: Props) {
  const isError = type === "error";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={[styles.card, isError ? styles.errorCard : styles.successCard]}>
          <View style={styles.iconRow}>
            <View style={[styles.iconCircle, isError ? styles.errorCircle : styles.successCircle]}>
              <Ionicons
                name={isError ? "alert" : "checkmark"}
                size={22}
                color="#fff"
              />
            </View>
            <Text style={styles.title}>{title}</Text>
          </View>

          <Text style={styles.message}>{message}</Text>

          <TouchableOpacity
            style={[styles.button, isError ? styles.errorButton : styles.successButton]}
            onPress={onClose}
          >
            <Text style={styles.buttonText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.25)",
    justifyContent: "center",
    alignItems: "center",
  },
  card: {
    width: "78%",
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 16,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },

  // ❌ remove the colored top border
  // just keep empty style objects so the code that uses them still works
  errorCard: {},
  successCard: {},

  iconRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  errorCircle: {
    backgroundColor: "#ff6b6b",
  },
  successCircle: {
    backgroundColor: "#0f5b63",
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f5b63",
  },
  message: {
    fontSize: 13,
    color: "#4c666b",
    marginBottom: 14,
  },
  button: {
    alignSelf: "flex-end",
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 999,
  },
  errorButton: {
    backgroundColor: "#ff6b6b",
  },
  successButton: {
    backgroundColor: "#0f5b63",
  },
  buttonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
});
