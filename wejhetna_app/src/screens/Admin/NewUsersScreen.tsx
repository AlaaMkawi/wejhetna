import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";

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

      <TouchableOpacity
        style={[styles.button, styles.primaryButton]}
        onPress={handleDriverRequestsPress}
      >
        <Text style={styles.buttonTextPrimary}>Drivers requests</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.button}
        onPress={handleBusinessRequestsPress}
      >
        <Text style={styles.buttonText}>Business owner requests</Text>
      </TouchableOpacity>
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
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 24,
    color: "#1B1338",
  },
  button: {
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 16,
    backgroundColor: "#ECEBFF",
    marginBottom: 16,
    alignItems: "center",
  },
  primaryButton: {
    backgroundColor: "#ED1C7B",
  },
  buttonText: {
    color: "#1B1338",
    fontWeight: "600",
    fontSize: 16,
  },
  buttonTextPrimary: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 16,
  },
});
