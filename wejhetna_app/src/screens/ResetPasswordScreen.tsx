import React, { useState } from "react";
import { useTranslation } from "react-i18next";
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

export default function ResetPasswordScreen({ route, navigation }: any) {
  const { t } = useTranslation();
  const emailFromRoute = route?.params?.email || "";
  const codeFromRoute = route?.params?.code || "";

  const [email] = useState(emailFromRoute);
  const [code] = useState(codeFromRoute);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);
  const [errorModal, setErrorModal] = useState<{ visible: boolean; title: string; message: string }>({
    visible: false,
    title: "",
    message: "",
  });

  // Helper functions to check individual password requirements
  const passwordMeetsLength = (pwd: string): boolean => pwd.length >= 8;
  const passwordMeetsUppercase = (pwd: string): boolean => /[A-Z]/.test(pwd);
  const passwordMeetsLowercase = (pwd: string): boolean => /[a-z]/.test(pwd);
  const passwordMeetsNumber = (pwd: string): boolean => /[0-9]/.test(pwd);
  const passwordMeetsSymbol = (pwd: string): boolean => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd);

  const validatePassword = (pwd: string): string | null => {
    if (!pwd) return null;
    
    if (!passwordMeetsLength(pwd)) {
      return t("password_too_short") || "Password must be at least 8 characters";
    }
    
    if (!passwordMeetsUppercase(pwd)) {
      return t("password_no_uppercase") || "Password must contain at least one uppercase letter";
    }
    
    if (!passwordMeetsLowercase(pwd)) {
      return t("password_no_lowercase") || "Password must contain at least one lowercase letter";
    }
    
    if (!passwordMeetsNumber(pwd)) {
      return t("password_no_number") || "Password must contain at least one number";
    }
    
    if (!passwordMeetsSymbol(pwd)) {
      return t("password_no_symbol") || "Password must contain at least one symbol";
    }
    
    return null;
  };

  const handlePasswordChange = (text: string) => {
    setPassword(text);
    if (!text) {
      setPasswordError(null);
    }
    // Clear confirm password error if passwords match
    if (text === confirmPassword) {
      setConfirmPasswordError(null);
    }
    setError(null);
  };

  const handleConfirmPasswordChange = (text: string) => {
    setConfirmPassword(text);
    if (text !== password) {
      setConfirmPasswordError(t("passwords_do_not_match") || "Passwords do not match");
    } else {
      setConfirmPasswordError(null);
    }
    setError(null);
  };

  const handleResetPassword = async () => {
    setError(null);
    setPasswordError(null);
    setConfirmPasswordError(null);

    // Validate password
    const pwdErr = validatePassword(password);
    if (pwdErr) {
      setPasswordError(pwdErr);
      return;
    }

    // Validate passwords match
    if (password !== confirmPassword) {
      setConfirmPasswordError(t("passwords_do_not_match") || "Passwords do not match");
      return;
    }

    try {
      setLoading(true);

      const res = await fetch(`${API_BASE_URL}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          code: code.trim(),
          new_password: password.trim(),
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        const errorMsg = json?.detail || t("password_reset_failed") || "Failed to reset password";
        setErrorModal({
          visible: true,
          title: t("error") || "Error",
          message: errorMsg,
        });
        return;
      }

      // Success - show modal then navigate to login
      setShowSuccessModal(true);

    } catch (e: any) {
      setErrorModal({
        visible: true,
        title: t("error") || "Error",
        message: t("network_error_message") || e?.message || t("network_error") || "Network error",
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
              <Text style={styles.welcome}>{t("reset_password") || "Reset Password"}</Text>
            </View>

            {/* Glass Card */}
            <View style={styles.glassCard}>
              <Text style={styles.title}>{t("create_new_password") || "Create new password"}</Text>

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

              {/* Password Input with Icons */}
              <View>
                <View style={styles.inputRow}>
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                    <Ionicons 
                      name={showPassword ? "eye-off" : "eye"} 
                      size={20} 
                      color="#66838a" 
                    />
                  </TouchableOpacity>
                  <TextInput
                    style={styles.inputFlex}
                    value={password}
                    onChangeText={handlePasswordChange}
                    placeholder={t("password") || "Password"}
                    placeholderTextColor="#66838a"
                    secureTextEntry={!showPassword}
                  />
                  <Ionicons 
                    name="lock-closed-outline" 
                    size={20} 
                    color={DARK_TEAL} 
                    style={{ marginLeft: 10 }} 
                  />
                </View>
                
                {/* Password Requirements Checklist */}
                {password.length > 0 && (
                  <View style={styles.passwordRequirements}>
                    {!passwordMeetsLength(password) && (
                      <View style={styles.requirementItem}>
                        <Ionicons name="close-circle" size={16} color="#d7263d" />
                        <Text style={styles.requirementText}>{t("password_req_length") || "At least 8 characters"}</Text>
                      </View>
                    )}
                    {!passwordMeetsUppercase(password) && (
                      <View style={styles.requirementItem}>
                        <Ionicons name="close-circle" size={16} color="#d7263d" />
                        <Text style={styles.requirementText}>{t("password_req_uppercase") || "Uppercase letter"}</Text>
                      </View>
                    )}
                    {!passwordMeetsLowercase(password) && (
                      <View style={styles.requirementItem}>
                        <Ionicons name="close-circle" size={16} color="#d7263d" />
                        <Text style={styles.requirementText}>{t("password_req_lowercase") || "Lowercase letter"}</Text>
                      </View>
                    )}
                    {!passwordMeetsNumber(password) && (
                      <View style={styles.requirementItem}>
                        <Ionicons name="close-circle" size={16} color="#d7263d" />
                        <Text style={styles.requirementText}>{t("password_req_number") || "Number"}</Text>
                      </View>
                    )}
                    {!passwordMeetsSymbol(password) && (
                      <View style={styles.requirementItem}>
                        <Ionicons name="close-circle" size={16} color="#d7263d" />
                        <Text style={styles.requirementText}>{t("password_req_symbol") || "Symbol"}</Text>
                      </View>
                    )}
                  </View>
                )}
                
                {passwordError && <Text style={styles.fieldError}>{passwordError}</Text>}
              </View>

              {/* Confirm Password Input with Icons */}
              <View>
                <View style={styles.inputRow}>
                  <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                    <Ionicons 
                      name={showConfirmPassword ? "eye-off" : "eye"} 
                      size={20} 
                      color="#66838a" 
                    />
                  </TouchableOpacity>
                  <TextInput
                    style={styles.inputFlex}
                    value={confirmPassword}
                    onChangeText={handleConfirmPasswordChange}
                    placeholder={t("confirm_password") || "Confirm password"}
                    placeholderTextColor="#66838a"
                    secureTextEntry={!showConfirmPassword}
                  />
                  <Ionicons 
                    name="lock-closed-outline" 
                    size={20} 
                    color={DARK_TEAL} 
                    style={{ marginLeft: 10 }} 
                  />
                </View>
                {confirmPasswordError && <Text style={styles.fieldError}>{confirmPasswordError}</Text>}
              </View>

              {error && <Text style={styles.error}>{error}</Text>}

              {/* Reset Password Button */}
              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  (!password.trim() || !confirmPassword.trim() || loading) && styles.buttonDisabled,
                ]}
                onPress={handleResetPassword}
                disabled={!password.trim() || !confirmPassword.trim() || loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color={DARK_TEAL} />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {t("reset_password") || "Reset Password"}
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
        title={t("password_reset_success") || "Password Reset Successful"}
        message={t("password_reset_success_message") || "Your password has been reset successfully. You can now login with your new password."}
        buttonText={t("go_to_login") || "Go to Login"}
        onPress={() => {
          setShowSuccessModal(false);
          navigation.reset({
            index: 0,
            routes: [{ name: "Login" }],
          });
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
  passwordRequirements: {
    marginTop: 8,
    marginBottom: 12,
    paddingLeft: 8,
  },
  requirementItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  requirementText: {
    fontSize: 12,
    color: "#d7263d",
    marginLeft: 6,
  },
  fieldError: {
    color: "#d7263d",
    fontSize: 12,
    marginTop: -16,
    marginBottom: 12,
    textAlign: "right",
  },
  error: {
    color: "#d7263d",
    textAlign: "center",
    marginTop: 6,
    marginBottom: 10,
    fontSize: 13,
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
