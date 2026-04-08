import React from "react";
import {
  View,
  StyleSheet,
  ImageBackground,
  StatusBar,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
} from "react-native";
import { useTranslation } from "react-i18next";
import RegularSignupForm from "./RegularSignupForm";

const { width, height } = Dimensions.get("window");
const DARK_TEAL = "#0f5b63";

export default function RegularSignupScreen({ route }: any) {
  const { t } = useTranslation();
  const email = route?.params?.email;

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
            keyboardShouldPersistTaps="handled"
          >
            {/* Header */}
            <View style={styles.headerContainer}>
              <Text style={styles.logoText}>Wejhetna</Text>
              <Text style={styles.welcome}>{t("create_your_account") || "Create your account"}</Text>
            </View>

            {/* Glass Card */}
            <View style={styles.glassCard}>
              <RegularSignupForm verifiedEmail={email} route={route} />
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
});
