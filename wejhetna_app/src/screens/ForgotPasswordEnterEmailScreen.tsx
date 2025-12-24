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

export default function ForgotPasswordEnterEmailScreen({ navigation }: any) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [errorModal, setErrorModal] = useState<{ visible: boolean; title: string; message: string }>({
    visible: false,
    title: "",
    message: "",
  });

  const sendCode = async () => {
    if (!email.trim()) {
      setErrorModal({
        visible: true,
        title: t("error") || "Error",
        message: t("please_enter_email") || "Please enter your email",
      });
      return;
    }

    try {
      setLoading(true);

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
      } catch (e) {
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

      // ✅ Success → show success modal then go to VerifyCode
      setShowSuccessModal(true);

    } catch (e: any) {
      setErrorModal({
        visible: true,
        title: t("error") || "Error",
        message: t("network_error_message") || e?.message || t("network_error") || "Something went wrong",
      });
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
              <Text style={styles.welcome}>{t("forgot_password") || "Forgot Password"}</Text>
            </View>

            {/* Glass Card */}
            <View style={styles.glassCard}>
              <Text style={styles.title}>{t("forgot_password_enter_email") || "Enter your email to reset password"}</Text>

              {/* Email Input with Icon */}
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.inputFlex}
                  placeholder={t("email") || "Email"}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                  placeholderTextColor="#66838a"
                />
                <Ionicons 
                  name="mail-outline" 
                  size={20} 
                  color={DARK_TEAL} 
                  style={{ marginLeft: 10 }} 
                />
              </View>

              {/* Send Code Button */}
              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  (!email.trim() || loading) && styles.buttonDisabled,
                ]}
                onPress={sendCode}
                disabled={!email.trim() || loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color={DARK_TEAL} />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {t("send_code") || "Send code"}
                  </Text>
                )}
              </TouchableOpacity>

              {/* Back to Login */}
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => navigation.navigate("Login")}
              >
                <Text style={styles.backButtonText}>{t("back_to_login") || "Back to Login"}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>

      {/* Success Modal */}
      <SuccessModal
        visible={showSuccessModal}
        title={t("code_sent") || "Code sent"}
        message={t("code_sent_message") || "Verification code has been sent to your email. Please check your inbox."}
        buttonText={t("continue") || "Continue"}
        onPress={() => {
          setShowSuccessModal(false);
          navigation.navigate("ForgotPasswordVerifyCode", { email: email.trim() });
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
  backButton: {
    marginTop: 16,
    alignItems: "center",
  },
  backButtonText: {
    color: DARK_TEAL,
    fontSize: 14,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
});
