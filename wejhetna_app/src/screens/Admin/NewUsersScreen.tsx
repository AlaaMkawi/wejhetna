import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";

const { width } = Dimensions.get("window");
const DARK_TEAL = "#0f5b63";
const SOFT_TEAL = "#3a8d96";
const MINT = "#9bd3d8";

type Props = {
  route: any;
  navigation: any;
};

export default function NewUsersScreen({ route, navigation }: Props) {
  const { adminUserId, role } = route.params || {};

  const handleDriverRequestsPress = () => {
    navigation.navigate("AdminDrivers", { adminUserId, role });
  };

  const handleBusinessRequestsPress = () => {
    navigation.navigate("AdminBusinessOwnerRequests", { adminUserId, role });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Requests</Text>

      <View style={styles.buttonsContainer}>
        <TouchableOpacity
          style={[styles.button, styles.primaryButton]}
          onPress={handleDriverRequestsPress}
          activeOpacity={0.85}
        >
          <View style={styles.buttonContent}>
            <Ionicons name="car-outline" size={32} color="#fff" />
            <Text style={styles.buttonTextPrimary}>Drivers requests</Text>
            <Ionicons name="arrow-forward" size={24} color="#fff" />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.secondaryButton]}
          onPress={handleBusinessRequestsPress}
          activeOpacity={0.85}
        >
          <View style={styles.buttonContent}>
            <Ionicons name="business-outline" size={32} color={DARK_TEAL} />
            <Text style={styles.buttonText}>Business owner requests</Text>
            <Ionicons name="arrow-forward" size={24} color={DARK_TEAL} />
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: "#F7F7FB",
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    marginBottom: 40,
    color: DARK_TEAL,
    textAlign: "center",
  },
  buttonsContainer: {
    flex: 1,
    justifyContent: "center",
    gap: 24,
  },
  button: {
    flex: 1,
    minHeight: 120,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
    paddingHorizontal: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  primaryButton: {
    backgroundColor: DARK_TEAL,
  },
  secondaryButton: {
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: SOFT_TEAL,
  },
  buttonContent: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    width: "100%",
  },
  buttonText: {
    color: DARK_TEAL,
    fontWeight: "700",
    fontSize: 18,
    textAlign: "center",
  },
  buttonTextPrimary: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 18,
    textAlign: "center",
  },
});
