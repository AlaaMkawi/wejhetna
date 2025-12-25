// src/businessOwner/BusinessOwnerSignupScreen.tsx
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ImageBackground,
  StatusBar,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
// ✅ correct paths from src/screens/businessOwner/
import { RootStackParamList } from "../../navigation/types";
import Ionicons from "react-native-vector-icons/Ionicons";

const { width, height } = Dimensions.get("window");
const DARK_TEAL = "#0f5b63";
const SOFT_TEAL = "#3a8d96";

type NavType = NativeStackNavigationProp<RootStackParamList, "BusinessOwnerSignup">;

export default function BusinessOwnerSignupScreen({ route }: any) {
  const { t } = useTranslation();
  const navigation = useNavigation<NavType>();

  // ✅ email comes ONLY from verified step - try route params
  const verifiedEmailFromRoute = route?.params?.email;

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  // Use verified email if available, otherwise allow manual entry (for backward compatibility)
  const [email, setEmail] = useState(verifiedEmailFromRoute || "");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  // Field-specific error states
  const [fullNameError, setFullNameError] = useState<string | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Validation functions (same as RegularSignupForm)
  const validateFullName = (name: string): string | null => {
    if (!name.trim()) return null;
    const nameRegex = /^[a-zA-Z\u0590-\u05FF\u0600-\u06FF\s]+$/;
    if (!nameRegex.test(name)) {
      return t("invalid_full_name") || "Name should contain only letters";
    }
    return null;
  };

  const validateUsername = (user: string): string | null => {
    if (!user.trim()) return null;
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
    const phoneRegex = /^05\d{8}$/;
    if (!phoneRegex.test(phoneNum)) {
      return t("invalid_phone") || "Phone must be 10 digits starting with 05";
    }
    return null;
  };

  // Password validation helpers
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
    setError(null);
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
    if (!text) {
      setPasswordError(null);
    }
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

  const handleSubmit = () => {
    setError(null);
    
    // ✅ Validate email exists if coming from verification flow
    if (verifiedEmailFromRoute && !email.trim()) {
      Alert.alert(
        t("error") || "Error",
        t("invalid_signup_flow") || "Invalid signup flow. Please start again."
      );
      return;
    }

    // Validate all fields
    if (!validateAllFields()) {
      setError(t("please_fix_errors") || "Please fix the errors above");
      return;
    }

    // ✅ Don't create user yet - just navigate to location picker with personal info
    // User will be created only after completing the entire signup process
    navigation.navigate("BusinessOwnerPickLocation", {
      personalInfo: {
        full_name: fullName.trim(),
        username: username.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password: password.trim(),
      },
    });
  };

  return (
    <ImageBackground
      source={require("../../../assets/wejhetna-logo.png")}
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
              <Text style={styles.welcome}>{t("business_owner") || "Business Owner"}</Text>
            </View>

            {/* Glass Card */}
            <View style={styles.glassCard}>
              <Text style={styles.title}>{t("business_owner") || "Business Owner"} – {t("sign_up") || "Signup"}</Text>

              {/* Full Name Input with Icon */}
              <View>
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.inputFlex}
                    placeholder={t("full_name") || "Full name"}
                    value={fullName}
                    onChangeText={handleFullNameChange}
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
                    placeholder={t("username") || "Username"}
                    autoCapitalize="none"
                    value={username}
                    onChangeText={handleUsernameChange}
                    placeholderTextColor="#66838a"
                  />
                  <Ionicons 
                    name="person-circle-outline" 
                    size={20} 
                    color={DARK_TEAL} 
                    style={{ marginLeft: 10 }} 
                  />
                </View>
                {usernameError && <Text style={styles.fieldError}>{usernameError}</Text>}
              </View>

              {/* Email Input with Icon */}
              <View>
                <View style={styles.inputRow}>
                  <TextInput
                    style={[styles.inputFlex, verifiedEmailFromRoute && styles.inputDisabled]}
                    placeholder={t("email") || "Email"}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    value={email}
                    onChangeText={verifiedEmailFromRoute ? undefined : setEmail}
                    editable={!verifiedEmailFromRoute}
                    placeholderTextColor="#66838a"
                  />
                  <Ionicons 
                    name="mail-outline" 
                    size={20} 
                    color={DARK_TEAL} 
                    style={{ marginLeft: 10 }} 
                  />
                </View>
              </View>

              {/* Phone Input with Icon */}
              <View>
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.inputFlex}
                    placeholder={t("phone") || "Phone"}
                    keyboardType="phone-pad"
                    value={phone}
                    onChangeText={handlePhoneChange}
                    maxLength={10}
                    placeholderTextColor="#66838a"
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

              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleSubmit}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryButtonText}>
                  {t("pick_location") || "Next: Pick Location"}
                </Text>
              </TouchableOpacity>
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
});
