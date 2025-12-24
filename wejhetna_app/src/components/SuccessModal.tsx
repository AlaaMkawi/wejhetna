import React, { useEffect, useRef } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";

const { width } = Dimensions.get("window");
const DARK_TEAL = "#0f5b63";
const SOFT_TEAL = "#3a8d96";
const SUCCESS_GREEN = "#4caf50";

type Props = {
  visible: boolean;
  title: string;
  message: string;
  buttonText?: string;
  onPress: () => void;
};

export default function SuccessModal({
  visible,
  title,
  message,
  buttonText = "Continue",
  onPress,
}: Props) {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const checkmarkScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // Reset animations
      scaleAnim.setValue(0);
      opacityAnim.setValue(0);
      checkmarkScale.setValue(0);

      // Animate modal appearance
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      // Animate checkmark with delay
      setTimeout(() => {
        Animated.spring(checkmarkScale, {
          toValue: 1,
          tension: 50,
          friction: 5,
          useNativeDriver: true,
        }).start();
      }, 150);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const modalScale = scaleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.8, 1],
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onPress}
    >
      <View style={styles.backdrop}>
        <Animated.View
          style={[
            styles.modalContainer,
            {
              transform: [{ scale: modalScale }],
              opacity: opacityAnim,
            },
          ]}
        >
          {/* Success Icon Circle */}
          <View style={styles.iconContainer}>
            <View style={styles.iconCircle}>
              <Animated.View
                style={{
                  transform: [{ scale: checkmarkScale }],
                }}
              >
                <Ionicons name="checkmark" size={48} color="#fff" />
              </Animated.View>
            </View>
          </View>

          {/* Title */}
          <Text style={styles.title}>{title}</Text>

          {/* Message */}
          <Text style={styles.message}>{message}</Text>

          {/* Button */}
          <TouchableOpacity
            style={styles.button}
            onPress={onPress}
            activeOpacity={0.85}
          >
            <Text style={styles.buttonText}>{buttonText}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContainer: {
    width: width * 0.85,
    maxWidth: 400,
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 32,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 16,
  },
  iconContainer: {
    marginBottom: 24,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: SUCCESS_GREEN,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: SUCCESS_GREEN,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: DARK_TEAL,
    textAlign: "center",
    marginBottom: 12,
  },
  message: {
    fontSize: 16,
    color: "#5c7c82",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 32,
  },
  button: {
    width: "100%",
    backgroundColor: SOFT_TEAL,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: "center",
    borderWidth: 2,
    borderColor: SOFT_TEAL,
  },
  buttonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },
});
