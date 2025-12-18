import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ImageBackground,
  StatusBar,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import SuccessModal from "../components/SuccessModal";

const { width, height } = Dimensions.get("window");
const DARK_TEAL = "#0f5b63";
const SOFT_TEAL = "#3a8d96";

const API_BASE_URL = "http://10.0.2.2:8000";

export default function VerifyEmailScreen({ route, navigation }: any) {
  const { t } = useTranslation();
  const emailFromRoute = route?.params?.email || "";

  const [email] = useState(emailFromRoute);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const handleVerify = async () => {
    if (!email.trim() || !code.trim()) {
      Alert.alert(t("error") || "Error", t("please_enter_email_and_code") || "Please enter email and code");
      return;
    }

    try {
      setLoading(true);

      const res = await fetch(`${API_BASE_URL}/auth/verify-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          code: code.trim(),
        }),
      });

      const json = await res.json();

     if (!res.ok) {
      Alert.alert(
        t("verification_failed") || "Verification failed",
        json?.detail || t("invalid_or_expired_code") || "Invalid or expired code"
      );
      return;
    }

    // Show success modal
    setShowSuccessModal(true);

  } catch (e: any) {
    Alert.alert(t("error") || "Network error", e?.message || t("error") || "Error");
  } finally {
    setLoading(false);
  }
};

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
              <Text style={styles.welcome}>{t("verify_your_email") || "Verify your email"}</Text>
            </View>

            {/* Glass Card */}
            <View style={styles.glassCard}>
              <Text style={styles.title}>{t("verify_your_email") || "Verify your email"}</Text>

              {/* Email Input with Icon (Disabled) */}
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.inputFlex, styles.inputDisabled]}
                  value={email}
                  editable={false}
                  placeholderTextColor="#66838a"
                />
                <Ionicons 
                  name="mail-outline" 
                  size={20} 
                  color={DARK_TEAL} 
                  style={{ marginLeft: 10 }} 
                />
              </View>

              {/* Verification Code Input with Icon */}
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.inputFlex}
                  value={code}
                  onChangeText={setCode}
                  placeholder={t("verification_code") || "Verification code"}
                  keyboardType="numeric"
                  placeholderTextColor="#66838a"
                />
                <Ionicons 
                  name="lock-closed-outline" 
                  size={20} 
                  color={DARK_TEAL} 
                  style={{ marginLeft: 10 }} 
                />
              </View>

              {/* Verify Button */}
              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  (!email.trim() || !code.trim() || loading) && styles.buttonDisabled,
                ]}
                onPress={handleVerify}
                disabled={!email.trim() || !code.trim() || loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color={DARK_TEAL} />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {t("verify") || "Verify"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>

      {/* Success Modal */}
      <SuccessModal
        visible={showSuccessModal}
        title={t("email_verified") || "Email verified"}
        message={t("email_verified_message") || "Your email was verified successfully.\nPlease complete your signup."}
        buttonText={t("continue") || "Continue"}
        onPress={() => {
          setShowSuccessModal(false);
          navigation.navigate("RegularSignup", {
            email: email.trim(),
          });
        }}
      />
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
    justifyContent: "center",
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
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#5c7c82",
    marginBottom: 20,
    paddingVertical: 10,
  },
  inputFlex: {
    flex: 1,
    textAlign: "right",
    fontSize: 16,
    color: DARK_TEAL,
    padding: 0,
  },
  inputDisabled: {
    opacity: 0.6,
  },
  primaryButton: {
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    borderRadius: 999,
    paddingVertical: 18,
    alignItems: "center",
    borderWidth: 2,
    borderColor: SOFT_TEAL,
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: DARK_TEAL,
    fontSize: 17,
    fontWeight: "700",
  },
});
