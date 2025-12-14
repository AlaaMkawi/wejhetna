// src/screens/Admin/UsersSelectorScreen.tsx

import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AdminTabParamList, RootStackParamList } from "../../navigation/types";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

type Props = NativeStackScreenProps<AdminTabParamList, "alreadyUsers">;

export default function UsersSelectorScreen({ route }: Props) {
  const { adminUserId, role } = route.params;
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const handleExistingUsers = () => {
    navigation.navigate("ExistingUsers", { adminUserId, role });
  };

  const handleRejectedUsers = () => {
    navigation.navigate("RejectedUsers", { adminUserId, role });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>User Management</Text>
        <Text style={styles.subtitle}>Choose an option to manage users</Text>
      </View>

      <View style={styles.optionsContainer}>
        <TouchableOpacity
          style={styles.optionCard}
          onPress={handleExistingUsers}
          activeOpacity={0.8}
        >
          <View style={styles.iconContainer}>
            <Text style={styles.icon}>👥</Text>
          </View>
          <Text style={styles.optionTitle}>Existing Users</Text>
          <Text style={styles.optionDescription}>
            View and manage all active and pending users
          </Text>
          <View style={styles.arrowContainer}>
            <Text style={styles.arrow}>→</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.optionCard}
          onPress={handleRejectedUsers}
          activeOpacity={0.8}
        >
          <View style={[styles.iconContainer, styles.rejectedIconContainer]}>
            <Text style={styles.icon}>🚫</Text>
          </View>
          <Text style={styles.optionTitle}>Rejected Users</Text>
          <Text style={styles.optionDescription}>
            View rejected users and their rejection reasons
          </Text>
          <View style={styles.arrowContainer}>
            <Text style={styles.arrow}>→</Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F7FA",
    padding: 20,
  },
  header: {
    marginTop: 40,
    marginBottom: 32,
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 8,
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 16,
    color: "#64748B",
    fontWeight: "500",
  },
  optionsContainer: {
    gap: 20,
  },
  optionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
    borderWidth: 0,
    position: "relative",
    overflow: "hidden",
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  rejectedIconContainer: {
    backgroundColor: "#FEF2F2",
  },
  icon: {
    fontSize: 32,
  },
  optionTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  optionDescription: {
    fontSize: 15,
    color: "#64748B",
    fontWeight: "400",
    lineHeight: 22,
    marginBottom: 16,
  },
  arrowContainer: {
    position: "absolute",
    bottom: 24,
    right: 24,
  },
  arrow: {
    fontSize: 24,
    color: "#6366F1",
    fontWeight: "700",
  },
});

