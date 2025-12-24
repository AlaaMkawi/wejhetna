import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
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
import MessageModal from "./MessageModal";

const { width, height } = Dimensions.get("window");
const DARK_TEAL = "#0f5b63";
const SOFT_TEAL = "#3a8d96";

const API_BASE_URL = "http://10.0.2.2:8000";

export default function ForgotPasswordVerifyCodeScreen({ route, navigation }: any) {
  const { t } = useTranslation();
  const emailFromRoute = route?.params?.email || "";

  const [email] = useState(emailFromRoute);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showResendSuccessModal, setShowResendSuccessModal] = useState(false);
  const [errorModal, setErrorModal] = useState<{ visible: boolean; title: string; message: string }>({
    visible: false,
    title: "",
    message: "",
  });

  const handleVerify = async () => {
    if (!email.trim() || !code.trim()) {
      setErrorModal({
        visible: true,
        title: t("error") || "Error",
        message: t("please_enter_email_and_code") || "Please enter email and code",
      });
      return;
    }

    try {
      setLoading(true);

      const res = await fetch(`${API_BASE_URL}/auth/verify-password-reset-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          code: code.trim(),
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setErrorModal({
          visible: true,
          title: t("verification_failed") || "Verification failed",
          message: json?.detail || t("invalid_or_expired_code") || "Invalid or expired code",
        });
        return;
      }

      // Show success modal
      setShowSuccessModal(true);

    } catch {
      setErrorModal({
        visible: true,
        title: t("error") || "Error",
        message: t("network_error_message") || t("network_error") || "Network error",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (!email.trim()) {
      return;
    }

    try {
      setResendLoading(true);

      // Get current language from i18n
      const currentLanguage = i18n.language || "ar";
      
      const res = await fetch(
        `${API_BASE_URL}/auth/request-password-reset`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            email: email.trim(),
            language: currentLanguage 
          }),
        }
      );

      let json;
      try {
        json = await res.json();
      } catch {
        setErrorModal({
          visible: true,
          title: t("error") || "Error",
          message: t("network_error_message") || "Network error occurred. Please try again.",
        });
        return;
      }

      if (!res.ok) {
        let errorMessage = json?.detail || t("failed_to_send_code") || "Failed to send verification code";
        
        // Check if it's an email not found error
        if (res.status === 404 || errorMessage.toLowerCase().includes("not found") || errorMessage.toLowerCase().includes("email")) {
          errorMessage = t("email_not_found") || "Email not found. Please check your email address or sign up for a new account.";
        }
        
        setErrorModal({
          visible: true,
          title: t("error") || "Error",
          message: errorMessage,
        });
        return;
      }

      // Show success message
      setShowResendSuccessModal(true);

    } catch {
      setErrorModal({
        visible: true,
        title: t("error") || "Error",
        message: t("network_error_message") || t("network_error") || "Something went wrong",
      });
    } finally {
      setResendLoading(false);
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
              <Text style={styles.welcome}>{t("verify_reset_code") || "Verify Reset Code"}</Text>
            </View>

            {/* Glass Card */}
            <View style={styles.glassCard}>
              <Text style={styles.title}>{t("enter_verification_code") || "Enter verification code"}</Text>

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

              {/* Resend Code Button */}
              <TouchableOpacity
                style={styles.resendButton}
                onPress={handleResendCode}
                disabled={resendLoading}
                activeOpacity={0.7}
              >
                {resendLoading ? (
                  <ActivityIndicator color={DARK_TEAL} size="small" />
                ) : (
                  <View style={styles.resendButtonContent}>
                    <Ionicons name="refresh-outline" size={16} color={DARK_TEAL} />
                    <Text style={styles.resendButtonText}>
                      {t("resend_code") || "Resend code"}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* Back to Enter Email */}
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => navigation.navigate("ForgotPasswordEnterEmail")}
              >
                <Text style={styles.backButtonText}>{t("back") || "Back"}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>

      {/* Success Modal */}
      <SuccessModal
        visible={showSuccessModal}
        title={t("code_verified") || "Code verified"}
        message={t("code_verified_message") || "Code verified successfully. You can now reset your password."}
        buttonText={t("continue") || "Continue"}
        onPress={() => {
          setShowSuccessModal(false);
          navigation.navigate("ResetPassword", {
            email: email.trim(),
            code: code.trim(),
          });
        }}
      />

      {/* Resend Code Success Modal */}
      <SuccessModal
        visible={showResendSuccessModal}
        title={t("code_resent") || "Code resent"}
        message={t("code_resent_message") || "Verification code has been resent to your email."}
        buttonText={t("ok") || "OK"}
        onPress={() => {
          setShowResendSuccessModal(false);
        }}
      />

      {/* Error Modal */}
      <MessageModal
        visible={errorModal.visible}
        type="error"
        title={errorModal.title}
        message={errorModal.message}
        onClose={() => setErrorModal({ ...errorModal, visible: false })}
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
  resendButton: {
    marginTop: 16,
    alignItems: "center",
    paddingVertical: 12,
  },
  resendButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  resendButtonText: {
    color: DARK_TEAL,
    fontSize: 14,
    fontWeight: "600",
  },
  backButton: {
    marginTop: 8,
    alignItems: "center",
  },
  backButtonText: {
    color: DARK_TEAL,
    fontSize: 14,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
});
