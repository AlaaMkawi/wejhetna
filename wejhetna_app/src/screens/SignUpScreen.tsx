import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ImageBackground,
  StatusBar,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import RegularSignupForm from "./RegularSignupForm";
import DriverSignupForm from "./DriverSignupForm";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { AuthStackParamList } from "../navigation/types";

const { width, height } = Dimensions.get("window");
const DARK_TEAL = "#0f5b63";
const SOFT_TEAL = "#3a8d96";

type SignupType = "choose" | "regular" | "driver";
type NavType = NativeStackNavigationProp<AuthStackParamList>;

export default function SignUpScreen() {
  const { t } = useTranslation();
  const [type, setType] = useState<SignupType>("choose");
  const navigation = useNavigation<NavType>();

  return (
    <ImageBackground
      source={require("../../assets/wejhetna-logo.png")}
      style={styles.backgroundImage}
      blurRadius={3}
      resizeMode="stretch"
    >
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboardContainer}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Header Area */}
            <View style={styles.headerContainer}>
              <Text style={styles.logoText}>Wejhetna</Text>
              <Text style={styles.welcome}>{t("create_your_account")}</Text>
            </View>

            {/* Glass Card */}
            <View style={styles.glassCard}>
              {type === "choose" && (
                <Text style={styles.title}>{t("sign_up_title")}</Text>
              )}

              {type === "choose" && (
                <>
                  <Text style={styles.subtitle}>{t("choose_how_to_use")}</Text>

                  {/* Three buttons filling the space nicely */}
                  <View style={styles.buttonsContainer}>
                    <TouchableOpacity
                      style={styles.primaryButton}
                      onPress={() => setType("regular")}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.primaryButtonText}>{t("regular_user")}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.secondaryButton}
                      onPress={() => setType("driver")}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.secondaryButtonText}>{t("driver")}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.secondaryButton}
                      onPress={() => navigation.navigate("BusinessOwnerSignup")}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.secondaryButtonText}>{t("business_owner")}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {type === "regular" && (
                <>
                  <RegularSignupForm onBack={() => setType("choose")} />
                </>
              )}

              {type === "driver" && (
                <>
                  <Text style={styles.modeLabel}>{t("driver_signup")}</Text>
                  <DriverSignupForm onBack={() => setType("choose")} />
                </>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  backgroundImage: {
    flex: 1,
    width: width,
    height: height,
  },
  overlay: {
    flex: 1,
    backgroundColor: "transparent",
  },
  keyboardContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  headerContainer: {
    alignItems: "center",
    marginBottom: 40,
    marginTop: 20,
  },
  logoText: {
    fontSize: 32,
    fontWeight: "800",
    color: DARK_TEAL,
    marginBottom: 6,
    textShadowColor: "rgba(0, 0, 0, 0.3)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  welcome: {
    fontSize: 18,
    color: "#5c7c82",
    fontWeight: "500",
    textShadowColor: "rgba(0, 0, 0, 0.3)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  glassCard: {
    backgroundColor: "transparent",
    width: "100%",
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderWidth: 0,
    shadowOpacity: 0,
    elevation: 0,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: DARK_TEAL,
    textAlign: "center",
    marginBottom: 24,
  },
  subtitle: {
    fontSize: 16,
    color: "#5c7c82",
    textAlign: "center",
    marginBottom: 32,
    fontWeight: "400",
    textShadowColor: "rgba(0, 0, 0, 0.2)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  modeLabel: {
    fontSize: 16,
    color: "#5c7c82",
    marginBottom: 16,
    textAlign: "center",
    fontWeight: "500",
  },
  buttonsContainer: {
    gap: 16,
    width: "100%",
    marginTop: 8,
  },
  primaryButton: {
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    borderRadius: 999,
    paddingVertical: 18,
    alignItems: "center",
    width: "100%",
    borderWidth: 2,
    borderColor: SOFT_TEAL,
    shadowColor: "rgba(255, 255, 255, 0.6)",
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 12,
  },
  primaryButtonText: {
    color: DARK_TEAL,
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.5,
    textShadowColor: "rgba(0, 0, 0, 0.15)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  secondaryButton: {
    borderRadius: 999,
    paddingVertical: 18,
    alignItems: "center",
    width: "100%",
    borderWidth: 2,
    borderColor: SOFT_TEAL,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    shadowColor: "rgba(0, 0, 0, 0.1)",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  secondaryButtonText: {
    color: DARK_TEAL,
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.5,
    textShadowColor: "rgba(0, 0, 0, 0.15)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
});
