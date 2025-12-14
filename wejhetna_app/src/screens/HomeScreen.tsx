// wejhetna_app/src/screens/HomeScreen.tsx
import React from "react";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "../components/LanguageSwitcher";

import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from "react-native";

type Props = {
  navigation: any;
};

// Modern soft color palette
const GRADIENT_START = "#e8f5f7";
const GRADIENT_MID = "#d1ebef";
const GRADIENT_END = "#b8e0e6";
const PRIMARY_COLOR = "#5ba8b5";
const ACCENT_COLOR = "#7bc4d1";
const SOFT_WHITE = "#ffffff";
const SOFT_BG = "#fafcfd";
const TEXT_PRIMARY = "#2d5a63";
const TEXT_SECONDARY = "#5a8a94";

export default function HomeScreen({ navigation }: Props) {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <LanguageSwitcher />
      
      {/* Decorative background elements */}
      <View style={styles.decorativeCircle1} />
      <View style={styles.decorativeCircle2} />
      <View style={styles.decorativeCircle3} />
      
      {/* Modern gradient header */}
      <View style={styles.headerContainer}>
        <View style={styles.gradientLayer1} />
        <View style={styles.gradientLayer2} />
        <View style={styles.gradientLayer3} />
        
        <View style={styles.headerContent}>
          <View style={styles.logoContainer}>
            <View style={styles.logoGlow} />
            <View style={styles.logoWrapper}>
              <Image
                source={require("../../assets/wejhetna-logo.png")}
                style={styles.logo}
                resizeMode="contain"
              />
            </View>
          </View>
          <Text style={styles.appName}>Wejhetna</Text>
          <Text style={styles.tagline}>Your Journey Starts Here</Text>
        </View>
      </View>

      {/* Modern glassmorphism card */}
      <View style={styles.cardContainer}>
        <View style={styles.cardGlow} />
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderLine} />
          </View>
          
          <View style={styles.buttonsContainer}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => navigation.navigate("Login")}
            >
              <View style={styles.buttonInnerGlow} />
              <Text style={styles.primaryButtonText}>{t("login")}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => navigation.navigate("SignUp")}
            >
              <Text style={styles.secondaryButtonText}>{t("create_account")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SOFT_BG,
    overflow: "hidden",
  },
  // Decorative circles
  decorativeCircle1: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: GRADIENT_END,
    opacity: 0.15,
    top: -80,
    right: -60,
  },
  decorativeCircle2: {
    position: "absolute",
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: ACCENT_COLOR,
    opacity: 0.12,
    top: 120,
    left: -50,
  },
  decorativeCircle3: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: PRIMARY_COLOR,
    opacity: 0.1,
    bottom: 200,
    right: 40,
  },
  // Header with gradient effect
  headerContainer: {
    position: "relative",
    paddingTop: 100,
    paddingBottom: 100,
    borderBottomLeftRadius: 50,
    borderBottomRightRadius: 50,
    overflow: "hidden",
  },
  gradientLayer1: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "100%",
    backgroundColor: GRADIENT_START,
  },
  gradientLayer2: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "70%",
    backgroundColor: GRADIENT_MID,
    opacity: 0.8,
  },
  gradientLayer3: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "40%",
    backgroundColor: GRADIENT_END,
    opacity: 0.6,
  },
  headerContent: {
    alignItems: "center",
    zIndex: 1,
    paddingHorizontal: 24,
  },
  logoContainer: {
    position: "relative",
    marginBottom: 20,
  },
  logoGlow: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: SOFT_WHITE,
    opacity: 0.3,
    top: -10,
    left: -10,
  },
  logoWrapper: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: SOFT_WHITE,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: PRIMARY_COLOR,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 12,
    borderWidth: 3,
    borderColor: SOFT_WHITE,
  },
  logo: {
    width: 80,
    height: 80,
  },
  appName: {
    fontSize: 36,
    fontWeight: "800",
    color: TEXT_PRIMARY,
    letterSpacing: 1,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 16,
    fontWeight: "400",
    color: TEXT_SECONDARY,
    letterSpacing: 0.5,
    opacity: 0.8,
  },
  // Card container
  cardContainer: {
    position: "relative",
    marginTop: -50,
    marginHorizontal: 20,
    zIndex: 2,
  },
  cardGlow: {
    position: "absolute",
    top: -10,
    left: -10,
    right: -10,
    bottom: -10,
    borderRadius: 40,
    backgroundColor: SOFT_WHITE,
    opacity: 0.5,
    shadowColor: PRIMARY_COLOR,
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.15,
    shadowRadius: 30,
    elevation: 15,
  },
  card: {
    backgroundColor: SOFT_WHITE,
    borderRadius: 36,
    paddingVertical: 40,
    paddingHorizontal: 28,
    shadowColor: PRIMARY_COLOR,
    shadowOffset: { width: 0, height: 15 },
    shadowOpacity: 0.2,
    shadowRadius: 25,
    elevation: 12,
    borderWidth: 1,
    borderColor: "rgba(91, 168, 181, 0.1)",
  },
  cardHeader: {
    alignItems: "center",
    marginBottom: 32,
  },
  cardHeaderLine: {
    width: 60,
    height: 4,
    borderRadius: 2,
    backgroundColor: ACCENT_COLOR,
    opacity: 0.4,
  },
  buttonsContainer: {
    gap: 18,
  },
  primaryButton: {
    backgroundColor: PRIMARY_COLOR,
    paddingVertical: 18,
    borderRadius: 20,
    alignItems: "center",
    position: "relative",
    overflow: "hidden",
    shadowColor: PRIMARY_COLOR,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  buttonInnerGlow: {
    position: "absolute",
    top: -20,
    left: -20,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: ACCENT_COLOR,
    opacity: 0.2,
  },
  primaryButtonText: {
    color: SOFT_WHITE,
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0.5,
    zIndex: 1,
  },
  secondaryButton: {
    paddingVertical: 18,
    borderRadius: 20,
    borderWidth: 2.5,
    borderColor: PRIMARY_COLOR,
    alignItems: "center",
    backgroundColor: SOFT_WHITE,
    shadowColor: PRIMARY_COLOR,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  secondaryButtonText: {
    color: PRIMARY_COLOR,
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
});
