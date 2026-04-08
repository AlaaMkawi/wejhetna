import React, { useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar, Platform, Animated } from "react-native";
import { useTranslation } from "react-i18next";
import Ionicons from "react-native-vector-icons/Ionicons";

const DARK_TEAL = "#0f5b63";
const SOFT_TEAL = "#3a8d96";

type Props = {
  route: any;
  navigation: any;
};

export default function NewUsersScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const { adminUserId, role } = route.params || {};

  // Animation values for driver card
  const driverScale = useRef(new Animated.Value(1)).current;
  const driverOpacity = useRef(new Animated.Value(1)).current;

  // Animation values for business card
  const businessScale = useRef(new Animated.Value(1)).current;
  const businessOpacity = useRef(new Animated.Value(1)).current;

  // Advertisement review card
  const adScale = useRef(new Animated.Value(1)).current;
  const adOpacity = useRef(new Animated.Value(1)).current;

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

  const handleDriverRequestsPress = () => {
    animatePress(driverScale, driverOpacity, () => {
      navigation.navigate("AdminDrivers", { adminUserId, role });
    });
  };

  const handleBusinessRequestsPress = () => {
    animatePress(businessScale, businessOpacity, () => {
      navigation.navigate("AdminBusinessOwnerRequests", { adminUserId, role });
    });
  };

  const handleAdvertisementReviewPress = () => {
    animatePress(adScale, adOpacity, () => {
      navigation.navigate("AdminAdvertisementsPending", { adminUserId, role });
    });
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Modern Centered Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{t("requests")}</Text>
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Driver Requests Card */}
        <TouchableOpacity
          activeOpacity={1}
          onPress={handleDriverRequestsPress}
        >
          <Animated.View
            style={[
              styles.card,
              {
                transform: [{ scale: driverScale }],
                opacity: driverOpacity,
              },
            ]}
          >
          <View style={styles.cardContent}>
            <View style={styles.cardIconContainer}>
              <View style={[styles.iconCircle, styles.driverIconCircle]}>
                <Ionicons name="car" size={32} color="#fff" />
              </View>
            </View>
            <View style={styles.cardTextContainer}>
              <Text style={styles.cardTitle}>{t("drivers_requests")}</Text>
              <Text style={styles.cardSubtitle}>
                {t("view_and_manage_driver_requests") || "View and manage driver requests"}
              </Text>
            </View>
          </View>
          </Animated.View>
        </TouchableOpacity>

        {/* Business Owner Requests Card */}
        <TouchableOpacity
          activeOpacity={1}
          onPress={handleBusinessRequestsPress}
        >
          <Animated.View
            style={[
              styles.card,
              {
                transform: [{ scale: businessScale }],
                opacity: businessOpacity,
              },
            ]}
          >
          <View style={styles.cardContent}>
            <View style={styles.cardIconContainer}>
              <View style={[styles.iconCircle, styles.businessIconCircle]}>
                <Ionicons name="business" size={32} color="#fff" />
              </View>
            </View>
            <View style={styles.cardTextContainer}>
              <Text style={styles.cardTitle}>{t("business_owner_requests")}</Text>
              <Text style={styles.cardSubtitle}>
                {t("view_and_manage_business_requests") || "View and manage business owner requests"}
              </Text>
            </View>
          </View>
          </Animated.View>
        </TouchableOpacity>

        {/* Advertisement review */}
        <TouchableOpacity
          activeOpacity={1}
          onPress={handleAdvertisementReviewPress}
        >
          <Animated.View
            style={[
              styles.card,
              {
                transform: [{ scale: adScale }],
                opacity: adOpacity,
              },
            ]}
          >
          <View style={styles.cardContent}>
            <View style={styles.cardIconContainer}>
              <View style={[styles.iconCircle, styles.adIconCircle]}>
                <Ionicons name="megaphone-outline" size={32} color="#fff" />
              </View>
            </View>
            <View style={styles.cardTextContainer}>
              <Text style={styles.cardTitle}>{t("advertisements.admin.menuTitle")}</Text>
              <Text style={styles.cardSubtitle}>
                {t("advertisements.admin.menuSubtitle")}
              </Text>
            </View>
          </View>
          </Animated.View>
        </TouchableOpacity>
      </ScrollView>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingTop: 4,
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 22,
  },
  card: {
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
  driverIconCircle: {
    backgroundColor: DARK_TEAL,
  },
  businessIconCircle: {
    backgroundColor: SOFT_TEAL,
  },
  adIconCircle: {
    backgroundColor: "#1d737a",
  },
  cardTextContainer: {
    flex: 1,
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1A1A1A",
    marginBottom: 6,
    letterSpacing: -0.2,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  cardSubtitle: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "400",
    lineHeight: 18,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
});
