// src/screens/Admin/UsersSelectorScreen.tsx

import React, { useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Platform,
  Animated,
} from "react-native";
import { useTranslation } from "react-i18next";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AdminTabParamList, RootStackParamList } from "../../navigation/types";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Ionicons from "react-native-vector-icons/Ionicons";

const DARK_TEAL = "#0f5b63";

type Props = NativeStackScreenProps<AdminTabParamList, "alreadyUsers">;

export default function UsersSelectorScreen({ route }: Props) {
  const { t } = useTranslation();
  const { adminUserId, role } = route.params;
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  // Animation values
  const existingScale = useRef(new Animated.Value(1)).current;
  const existingOpacity = useRef(new Animated.Value(1)).current;
  const rejectedScale = useRef(new Animated.Value(1)).current;
  const rejectedOpacity = useRef(new Animated.Value(1)).current;

  const animatePress = (scale: Animated.Value, opacity: Animated.Value, callback: () => void) => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 0.95,
        useNativeDriver: true,
        tension: 300,
        friction: 10,
      }),
      Animated.timing(opacity, {
        toValue: 0.8,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start(() => {
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          tension: 300,
          friction: 10,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }),
      ]).start();
      callback();
    });
  };

  const handleExistingUsers = () => {
    animatePress(existingScale, existingOpacity, () => {
      navigation.navigate("ExistingUsers", { adminUserId, role });
    });
  };

  const handleRejectedUsers = () => {
    animatePress(rejectedScale, rejectedOpacity, () => {
      navigation.navigate("RejectedUsers", { adminUserId, role });
    });
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Modern Centered Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{t("user_management") || "User Management"}</Text>
      </View>

      <View style={styles.optionsContainer}>
        <TouchableOpacity
          activeOpacity={1}
          onPress={handleExistingUsers}
        >
          <Animated.View
            style={[
              styles.optionCard,
              {
                transform: [{ scale: existingScale }],
                opacity: existingOpacity,
              },
            ]}
          >
            <View style={styles.cardContent}>
              <View style={styles.cardIconContainer}>
                <View style={[styles.iconCircle, styles.existingIconCircle]}>
                  <Ionicons name="people" size={32} color="#fff" />
                </View>
              </View>
              <View style={styles.cardTextContainer}>
                <Text style={styles.optionTitle}>{t("existing_users") || "Existing Users"}</Text>
                <Text style={styles.optionDescription}>
                  {t("view_and_manage_active_pending_users") || "View and manage all active and pending users"}
                </Text>
              </View>
            </View>
          </Animated.View>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={1}
          onPress={handleRejectedUsers}
        >
          <Animated.View
            style={[
              styles.optionCard,
              {
                transform: [{ scale: rejectedScale }],
                opacity: rejectedOpacity,
              },
            ]}
          >
            <View style={styles.cardContent}>
              <View style={styles.cardIconContainer}>
                <View style={[styles.iconCircle, styles.rejectedIconCircle]}>
                  <Ionicons name="close-circle" size={32} color="#fff" />
                </View>
              </View>
              <View style={styles.cardTextContainer}>
                <Text style={styles.optionTitle}>{t("rejected_users") || "Rejected Users"}</Text>
                <Text style={styles.optionDescription}>
                  {t("view_rejected_users_reasons") || "View rejected users and their rejection reasons"}
                </Text>
              </View>
            </View>
          </Animated.View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  header: {
    paddingTop: Platform.OS === "ios" ? 12 : StatusBar.currentHeight ? StatusBar.currentHeight + 4 : 12,
    paddingBottom: 0,
    paddingHorizontal: 24,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: DARK_TEAL,
    letterSpacing: -0.3,
    textAlign: "center",
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  optionsContainer: {
    flex: 1,
    paddingTop: 4,
    paddingHorizontal: 20,
    paddingBottom: 24,
    justifyContent: "center",
    gap: 22,
  },
  optionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    marginBottom: 18,
    shadowColor: DARK_TEAL,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 6,
    borderWidth: 1,
    borderColor: "#E8E8E8",
    overflow: "hidden",
  },
  cardContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: 22,
    backgroundColor: "#F8F9FA",
  },
  cardIconContainer: {
    marginRight: 16,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2,
    shadowRadius: 9,
    elevation: 5,
  },
  existingIconCircle: {
    backgroundColor: DARK_TEAL,
  },
  rejectedIconCircle: {
    backgroundColor: "#F44336",
  },
  cardTextContainer: {
    flex: 1,
    justifyContent: "center",
  },
  optionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1A1A1A",
    marginBottom: 6,
    letterSpacing: -0.2,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  optionDescription: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "400",
    lineHeight: 18,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
});

