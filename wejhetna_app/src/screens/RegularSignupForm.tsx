import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import SuccessModal from "../components/SuccessModal";

import { API_BASE_URL } from "../../config";
const DARK_TEAL = "#0f5b63";
const SOFT_TEAL = "#3a8d96";

export default function RegularSignupForm({ verifiedEmail, onBack: _onBack, route }: any) {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();

  // All hooks must be called before any conditional returns
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Field-specific error states
  const [fullNameError, setFullNameError] = useState<string | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // ✅ email comes ONLY from verified step - try both prop and route params
  const email = verifiedEmail || route?.params?.email;
  if (!email || !email.trim()) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>
          {t("invalid_signup_flow") || "Invalid signup flow. Please start again."}
        </Text>
      </View>
    );
  }

  // Validation functions
  const validateFullName = (name: string): string | null => {
    if (!name.trim()) return null; // Don't show error when empty
    // Only letters and spaces allowed
    const nameRegex = /^[a-zA-Z\u0590-\u05FF\u0600-\u06FF\s]+$/;
    if (!nameRegex.test(name)) {
      return t("invalid_full_name") || "Name should contain only letters";
    }
    return null;
  };

  const validateUsername = (user: string): string | null => {
    if (!user.trim()) return null;
    // Username should be at least 3 characters, alphanumeric and underscore
    if (user.length < 3) {
      return t("invalid_username") || "Username must be at least 3 characters";
    }
    const usernameRegex = /^[a-zA-Z0-9_]+$/;
    if (!usernameRegex.test(user)) {
      return t("invalid_username") || "Username can only contain letters, numbers, and underscore";
    }
    return null;
  };

  const validatePhone = (phoneNum: string): string | null => {
    if (!phoneNum.trim()) return null;
    // Should be exactly 10 digits and start with 05
    const phoneRegex = /^05\d{8}$/;
    if (!phoneRegex.test(phoneNum)) {
      return t("invalid_phone") || "Phone must be 10 digits starting with 05";
    }
    return null;
  };

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

  // Handle field changes with validation
  const handleFullNameChange = (text: string) => {
    setFullName(text);
    setFullNameError(validateFullName(text));
    setError(null); // Clear general error
  };

  const handleUsernameChange = (text: string) => {
    setUsername(text);
    setUsernameError(validateUsername(text));
    setError(null);
  };

  const handlePhoneChange = (text: string) => {
    // Only allow numbers
    const numbersOnly = text.replace(/[^0-9]/g, '');
    setPhone(numbersOnly);
    setPhoneError(validatePhone(numbersOnly));
    setError(null);
  };

  const handlePasswordChange = (text: string) => {
    setPassword(text);
    // Only show error when field loses focus or on submit, not while typing
    // Clear password error while typing (checklist will show requirements instead)
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

  const validateAllFields = (): boolean => {
    const nameErr = validateFullName(fullName);
    const userErr = validateUsername(username);
    const phoneErr = validatePhone(phone);
    const pwdErr = validatePassword(password);
    const confirmErr = password !== confirmPassword 
      ? (t("passwords_do_not_match") || "Passwords do not match") 
      : null;

    setFullNameError(nameErr);
    setUsernameError(userErr);
    setPhoneError(phoneErr);
    setPasswordError(pwdErr);
    setConfirmPasswordError(confirmErr);

    return !nameErr && !userErr && !phoneErr && !pwdErr && !confirmErr;
  };

  const signupRegular = async () => {
    setError(null);

    // Validate all fields
    if (!validateAllFields()) {
      setError(t("please_fix_errors") || "Please fix the errors above");
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/auth/signup/regular`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName,
          username,
          email, // ✅ verified email
          phone,
          password,
          password_confirmation: confirmPassword,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        const errorMsg = typeof json?.detail === "string" ? json.detail : t("signup_failed");
        
        // Handle specific backend validation errors
        if (errorMsg.toLowerCase().includes("email not verified")) {
          setError(t("email_not_verified") || "Email not verified. Please verify your email first.");
        } else if (errorMsg.toLowerCase().includes("username") && errorMsg.toLowerCase().includes("exists")) {
          setUsernameError(t("username_taken") || "Username already exists");
        } else if (errorMsg.toLowerCase().includes("email") && errorMsg.toLowerCase().includes("exists")) {
          setError(t("email_already_exists") || "Email already exists");
        } else if (errorMsg.toLowerCase().includes("phone") && (errorMsg.toLowerCase().includes("exists") || errorMsg.toLowerCase().includes("already"))) {
          setPhoneError(t("phone_taken") || "Phone number already exists");
        } else if (errorMsg.toLowerCase().includes("full_name") || errorMsg.toLowerCase().includes("name")) {
          setFullNameError(errorMsg);
        } else if (errorMsg.toLowerCase().includes("phone")) {
          setPhoneError(errorMsg);
        } else if (errorMsg.toLowerCase().includes("password")) {
          setPasswordError(errorMsg);
        } else {
          setError(errorMsg);
        }
        return;
      }

      // ✅ Signup done → show success message then go to Login
      setShowSuccessModal(true);

    } catch {
      setError(t("network_error"));
    }
  };

  return (
    <View style={styles.container}>
      {/* Full Name Input with Icon */}
      <View>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.inputFlex}
            value={fullName}
            onChangeText={handleFullNameChange}
            placeholder={t("full_name")}
            placeholderTextColor="#66838a"
          />
          <Ionicons 
            name="person-outline" 
            size={20} 
            color={DARK_TEAL} 
            style={{ marginLeft: 10 }} 
          />
        </View>
        {fullNameError && <Text style={styles.fieldError}>{fullNameError}</Text>}
      </View>

      {/* Username Input with Icon */}
      <View>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.inputFlex}
            value={username}
            onChangeText={handleUsernameChange}
            placeholder={t("username")}
            placeholderTextColor="#66838a"
            autoCapitalize="none"
          />
          <Ionicons 
            name="at-outline" 
            size={20} 
            color={DARK_TEAL} 
            style={{ marginLeft: 10 }} 
          />
        </View>
        {usernameError && <Text style={styles.fieldError}>{usernameError}</Text>}
      </View>

      {/* Phone Input with Icon */}
      <View>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.inputFlex}
            value={phone}
            onChangeText={handlePhoneChange}
            placeholder={t("phone")}
            placeholderTextColor="#66838a"
            keyboardType="phone-pad"
            maxLength={10}
          />
          <Ionicons 
            name="call-outline" 
            size={20} 
            color={DARK_TEAL} 
            style={{ marginLeft: 10 }} 
          />
        </View>
        {phoneError && <Text style={styles.fieldError}>{phoneError}</Text>}
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
            placeholder={t("password")}
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
        
        {/* Password Requirements Checklist - only show when password field has focus or content */}
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

      {/* Sign Up Button */}
      <TouchableOpacity 
        style={styles.primaryButton} 
        onPress={signupRegular}
        activeOpacity={0.85}
      >
        <Text style={styles.primaryButtonText}>{t("sign_up")}</Text>
      </TouchableOpacity>

      {/* Success Modal */}
      <SuccessModal
        visible={showSuccessModal}
        title={t("success") || "Success"}
        message={t("signup_successful") || "Your account has been created successfully!"}
        buttonText={t("ok") || "OK"}
        onPress={() => {
          setShowSuccessModal(false);
          navigation.reset({
            index: 0,
            routes: [{ name: "Login" }],
          });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
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
  primaryButtonText: {
    color: DARK_TEAL,
    fontSize: 17,
    fontWeight: "700",
  },
  error: {
    color: "#d7263d",
    textAlign: "center",
    marginTop: 6,
    marginBottom: 10,
    fontSize: 13,
  },
  errorText: {
    color: "#d7263d",
    textAlign: "center",
    fontSize: 14,
  },
  fieldError: {
    color: "#d7263d",
    fontSize: 12,
    marginTop: -15,
    marginBottom: 15,
    textAlign: "right",
    paddingRight: 5,
  },
  passwordRequirements: {
    marginTop: -10,
    marginBottom: 15,
    paddingRight: 5,
  },
  requirementItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  requirementText: {
    color: "#5c7c82",
    fontSize: 12,
    marginLeft: 6,
    textAlign: "right",
  },
});
