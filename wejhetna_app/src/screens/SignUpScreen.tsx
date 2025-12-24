import React from "react";
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
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";

const { width, height } = Dimensions.get("window");
const DARK_TEAL = "#0f5b63";
const SOFT_TEAL = "#3a8d96";

type NavType = NativeStackNavigationProp<RootStackParamList>;

export default function SignUpScreen() {
  const { t } = useTranslation();
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
            {/* Header */}
            <View style={styles.headerContainer}>
              <Text style={styles.logoText}>Wejhetna</Text>
              <Text style={styles.welcome}>{t("create_your_account")}</Text>
            </View>

            {/* Glass Card */}
            <View style={styles.glassCard}>
              <Text style={styles.title}>{t("sign_up_title")}</Text>
              <Text style={styles.subtitle}>{t("choose_how_to_use")}</Text>

              <View style={styles.buttonsContainer}>
                {/* REGULAR USER → EMAIL FIRST */}
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={() => navigation.navigate("EnterEmail", { userType: "regular" })}
                  activeOpacity={0.85}
                >
                  <Text style={styles.primaryButtonText}>
                    {t("regular_user")}
                  </Text>
                </TouchableOpacity>

                {/* DRIVER → EMAIL FIRST */}
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => navigation.navigate("EnterEmail", { userType: "driver" })}
                  activeOpacity={0.85}
                >
                  <Text style={styles.secondaryButtonText}>
                    {t("driver")}
                  </Text>
                </TouchableOpacity>

                {/* BUSINESS OWNER → EMAIL FIRST */}
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => navigation.navigate("EnterEmail", { userType: "owner" })}
                  activeOpacity={0.85}
                >
                  <Text style={styles.secondaryButtonText}>
                    {t("business_owner")}
                  </Text>
                </TouchableOpacity>
              </View>
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
    width,
    height,
  },
  overlay: {
    flex: 1,
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
  },
  welcome: {
    fontSize: 18,
    color: "#5c7c82",
  },
  glassCard: {
    width: "100%",
    paddingHorizontal: 24,
    paddingVertical: 20,
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
  },
  modeLabel: {
    fontSize: 16,
    color: "#5c7c82",
    marginBottom: 16,
    textAlign: "center",
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
    borderWidth: 2,
    borderColor: SOFT_TEAL,
  },
  primaryButtonText: {
    color: DARK_TEAL,
    fontSize: 17,
    fontWeight: "700",
  },
  secondaryButton: {
    borderRadius: 999,
    paddingVertical: 18,
    alignItems: "center",
    borderWidth: 2,
    borderColor: SOFT_TEAL,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  secondaryButtonText: {
    color: DARK_TEAL,
    fontSize: 17,
    fontWeight: "700",
  },
});
