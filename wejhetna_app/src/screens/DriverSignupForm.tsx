import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { launchImageLibrary } from "react-native-image-picker";
import MessageModal from "./MessageModal"; // 👈 pretty popup
import Ionicons from "react-native-vector-icons/Ionicons";

const API_BASE_URL = "http://10.0.2.2:8000";

const MINT = "#9bd3d8";
const DARK_TEAL = "#0f5b63";

type Props = {
  onBack?: () => void;
  verifiedEmail?: string;
  route?: any;
  navigation?: any;
};

export default function DriverSignupForm({ onBack, verifiedEmail, route, navigation: navigationProp }: Props) {
  const { t } = useTranslation();
  const navigationHook = useNavigation<any>();
  // Use prop navigation if provided, otherwise use hook
  const navigation = navigationProp || navigationHook;
  
  // ✅ email comes ONLY from verified step - try both prop and route params
  const verifiedEmailFromRoute = verifiedEmail || route?.params?.email;
  
  // 🔹 Step state: 1 = basic info, 2 = driver details + docs
  const [step, setStep] = useState<1 | 2>(1);

  // ----- STEP 1: BASIC USER INFO (same as regular user) -----
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

  // ----- STEP 2: CAR + DRIVER INFO -----
  const [carType, setCarType] = useState("");
  const [plateNumber, setPlateNumber] = useState("");
  const [productionYear, setProductionYear] = useState("");

  // DOC URL FIELDS (images)
  const [driverLicenseUrl, setDriverLicenseUrl] = useState("");
  const [carLicenseUrl, setCarLicenseUrl] = useState("");
  const [carInsuranceUrl, setCarInsuranceUrl] = useState("");
  const [carPhoto1Url, setCarPhoto1Url] = useState("");
  const [carPhoto2Url, setCarPhoto2Url] = useState("");

  // Upload loading states
  const [uploadingDriverLicense, setUploadingDriverLicense] = useState(false);
  const [uploadingCarLicense, setUploadingCarLicense] = useState(false);
  const [uploadingCarInsurance, setUploadingCarInsurance] = useState(false);
  const [uploadingCarPhoto1, setUploadingCarPhoto1] = useState(false);
  const [uploadingCarPhoto2, setUploadingCarPhoto2] = useState(false);

  // ID is a long number string (NOT a photo)
  const [idNumber, setIdNumber] = useState("");
  
  // Step 2 field error states
  const [idNumberError, setIdNumberError] = useState<string | null>(null);
  const [carTypeError, setCarTypeError] = useState<string | null>(null);
  const [plateNumberError, setPlateNumberError] = useState<string | null>(null);
  const [productionYearError, setProductionYearError] = useState<string | null>(null);

  const [, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 🔹 modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState<"error" | "success">("error");
  const [modalTitle, setModalTitle] = useState("");
  const [modalMessage, setModalMessage] = useState("");

  const showModal = (
    type: "error" | "success",
    title: string,
    message: string
  ) => {
    setModalType(type);
    setModalTitle(title);
    setModalMessage(message);
    setModalVisible(true);
  };

  // ----- SMALL VALIDATION HELPERS -----
  const isValidEmail = (value: string) => /\S+@\S+\.\S+/.test(value.trim());

  const isValidPhone = (value: string) => {
    // Exactly 10 digits starting with 05 (same as regular user)
    const phoneRegex = /^05\d{8}$/;
    return phoneRegex.test(value);
  };

  // Password validation helpers (same as regular user)
  const passwordMeetsLength = (pwd: string): boolean => pwd.length >= 8;
  const passwordMeetsUppercase = (pwd: string): boolean => /[A-Z]/.test(pwd);
  const passwordMeetsLowercase = (pwd: string): boolean => /[a-z]/.test(pwd);
  const passwordMeetsNumber = (pwd: string): boolean => /[0-9]/.test(pwd);
  const passwordMeetsSymbol = (pwd: string): boolean => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd);

  const isStrongPassword = (value: string) => {
    // Same as regular user: 8+ chars, uppercase, lowercase, number, symbol
    return passwordMeetsLength(value) && 
           passwordMeetsUppercase(value) && 
           passwordMeetsLowercase(value) && 
           passwordMeetsNumber(value) && 
           passwordMeetsSymbol(value);
  };

  const validateFullName = (name: string): string | null => {
    if (!name.trim()) return null;
    // Only letters and spaces allowed (same as regular user)
    const nameRegex = /^[a-zA-Z\u0590-\u05FF\u0600-\u06FF\s]+$/;
    if (!nameRegex.test(name)) {
      return t("invalid_full_name") || "Name should contain only letters";
    }
    return null;
  };

  const isValidUsername = (value: string) => {
    // 3–20 chars, letters/numbers/underscore only
    return /^[A-Za-z0-9_]{3,20}$/.test(value);
  };

  const isValidIdNumber = (value: string) => {
    // digits only, exactly 9 digits
    return /^[0-9]{9}$/.test(value.trim());
  };

  const isValidProductionYear = (value: string) => {
    const year = Number(value);
    if (!Number.isInteger(year)) return false;
    const current = new Date().getFullYear();
    return year >= 1990 && year <= current + 1;
  };

  const isValidPlateNumber = (value: string) => {
    const trimmed = value.trim();
    // at least 5 chars and must contain a digit
    return trimmed.length >= 5 && /\d/.test(trimmed);
  };

  // ----- IMAGE UPLOAD HELPER -----
  const pickAndUpload = async (
    setUrl: (url: string) => void,
    setUploading: (loading: boolean) => void
  ) => {
    launchImageLibrary({ 
      mediaType: "photo",
      quality: 0.7, // Reduce image quality to save memory
      maxWidth: 1920, // Limit max width
      maxHeight: 1920, // Limit max height
    }, async (res) => {
      if (res.didCancel || res.errorCode) {
        console.log("User cancelled or error:", res.errorMessage);
        return;
      }

      const asset = res.assets?.[0];
      if (!asset || !asset.uri) return;

      setUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", {
          uri: asset.uri,
          name: asset.fileName || "upload.jpg",
          type: asset.type || "image/jpeg",
        } as any);

        const uploadRes = await fetch(`${API_BASE_URL}/files/upload`, {
          method: "POST",
          headers: { "Content-Type": "multipart/form-data" },
          body: formData,
        });
        const json = await uploadRes.json();
        if (json.file_url) {
          setUrl(json.file_url);
        } else {
          showModal("error", t("error") || "Error", t("upload_failed") || "Failed to upload image");
        }
      } catch (e: any) {
        console.log("Upload error", e?.message || e);
        showModal("error", t("error") || "Error", t("upload_failed") || "Failed to upload image: " + (e?.message || "Unknown error"));
      } finally {
        setUploading(false);
      }
    });
  };

  const uploadDriverLicense = () => pickAndUpload(setDriverLicenseUrl, setUploadingDriverLicense);
  const uploadCarLicense = () => pickAndUpload(setCarLicenseUrl, setUploadingCarLicense);
  const uploadCarInsurance = () => pickAndUpload(setCarInsuranceUrl, setUploadingCarInsurance);
  const uploadCarPhoto1 = () => pickAndUpload(setCarPhoto1Url, setUploadingCarPhoto1);
  const uploadCarPhoto2 = () => pickAndUpload(setCarPhoto2Url, setUploadingCarPhoto2);

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
    // Only allow numbers, max 10 digits
    const numbersOnly = text.replace(/[^0-9]/g, '').slice(0, 10);
    setPhone(numbersOnly);
    setPhoneError(isValidPhone(numbersOnly) ? null : (numbersOnly.length > 0 ? (t("invalid_phone") || "Phone must be 10 digits starting with 05") : null));
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

  // Step 2 field handlers with validation
  const handleIdNumberChange = (text: string) => {
    // Only allow numbers, max 9 digits
    const numbersOnly = text.replace(/[^0-9]/g, '').slice(0, 9);
    setIdNumber(numbersOnly);
    if (numbersOnly.length > 0) {
      const err = isValidIdNumber(numbersOnly) 
        ? null 
        : (t("id_number_must_be_9_digits") || "ID number must be exactly 9 digits");
      setIdNumberError(err);
    } else {
      setIdNumberError(null);
    }
    setError(null);
  };

  const handleCarTypeChange = (text: string) => {
    setCarType(text);
    if (text.trim().length > 0) {
      const err = text.trim().length < 2 
        ? (t("car_type_min_chars") || "Car type should be at least 2 characters") 
        : null;
      setCarTypeError(err);
    } else {
      setCarTypeError(null);
    }
    setError(null);
  };

  const handlePlateNumberChange = (text: string) => {
    setPlateNumber(text);
    if (text.trim().length > 0) {
      const err = isValidPlateNumber(text.trim()) 
        ? null 
        : (t("plate_number_format_error") || "Plate number should be at least 5 characters and include a digit");
      setPlateNumberError(err);
    } else {
      setPlateNumberError(null);
    }
    setError(null);
  };

  const handleProductionYearChange = (text: string) => {
    // Only allow numbers
    const numbersOnly = text.replace(/[^0-9]/g, '');
    setProductionYear(numbersOnly);
    if (numbersOnly.length > 0) {
      const err = isValidProductionYear(numbersOnly) 
        ? null 
        : (() => {
            const current = new Date().getFullYear();
            return t("production_year_error") || `Production year must be a valid number between 1990 and ${current + 1}`;
          })();
      setProductionYearError(err);
    } else {
      setProductionYearError(null);
    }
    setError(null);
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

  // ----- STEP 1 → VALIDATION & CONTINUE -----
  const goToStep2 = () => {
    setResult(null);
    setError(null);
    setFullNameError(null);
    setUsernameError(null);
    setPhoneError(null);
    setPasswordError(null);
    setConfirmPasswordError(null);

    // ✅ Validate email exists if coming from verification flow
    if (verifiedEmailFromRoute && !email.trim()) {
      const msg = t("invalid_signup_flow") || "Invalid signup flow. Please start again.";
      setError(msg);
      showModal("error", t("error") || "Error", msg);
      return;
    }

    const nameTrim = fullName.trim();
    const usernameTrim = username.trim();
    const emailTrim = email.trim();
    const phoneTrim = phone.trim();
    const passwordTrim = password.trim();
    const confirmPasswordTrim = confirmPassword.trim();

    // Validate all fields
    const nameErr = validateFullName(nameTrim);
    const userErr = validateUsername(usernameTrim);
    const phoneErr = isValidPhone(phoneTrim) ? null : (t("invalid_phone") || "Phone must be 10 digits starting with 05");
    const pwdErr = validatePassword(passwordTrim);
    const confirmErr = passwordTrim !== confirmPasswordTrim 
      ? (t("passwords_do_not_match") || "Passwords do not match") 
      : null;

    setFullNameError(nameErr);
    setUsernameError(userErr);
    setPhoneError(phoneErr);
    setPasswordError(pwdErr);
    setConfirmPasswordError(confirmErr);

    if (nameErr || userErr || phoneErr || pwdErr || confirmErr) {
      const msg = t("please_fix_errors") || "Please fix the errors above";
      setError(msg);
      showModal("error", t("error") || "Error", msg);
      return;
    }

    if (!nameTrim || !usernameTrim || !emailTrim || !phoneTrim || !passwordTrim || !confirmPasswordTrim) {
      const msg = t("please_fix_errors") || "Please fill all basic info before continuing.";
      setError(msg);
      showModal("error", t("error") || "Error", msg);
      return;
    }

    if (!isValidEmail(emailTrim)) {
      const msg = t("invalid_email_address") || "Please enter a valid email address.";
      setError(msg);
      showModal("error", t("sign_up_error") || "Sign up error", msg);
      return;
    }

    setStep(2);
  };

  // ----- FINAL SIGNUP (ON STEP 2) -----
  const signupDriver = async () => {
    setResult(null);
    setError(null);

    const carTypeTrim = carType.trim();
    const plateTrim = plateNumber.trim();
    const prodYearTrim = productionYear.trim();
    const idTrim = idNumber.trim();
    const driverLicenseTrim = driverLicenseUrl.trim();
    const carLicenseTrim = carLicenseUrl.trim();
    const carInsuranceTrim = carInsuranceUrl.trim();

    // 🔸 Check required fields across both steps
    if (
      !fullName.trim() ||
      !username.trim() ||
      !email.trim() ||
      !phone.trim() ||
      !password.trim() ||
      !confirmPassword.trim() ||
      !carTypeTrim ||
      !plateTrim ||
      !prodYearTrim ||
      !driverLicenseTrim ||
      !idTrim ||
      !carLicenseTrim ||
      !carInsuranceTrim
    ) {
      const msg = t("fill_all_required_fields") || "Please fill all required fields.";
      setError(msg);
      showModal("error", t("sign_up_error") || "Sign up error", msg);
      return;
    }

    // 🔸 Re-check core rules in case user changed something after Step 1
    const nameErr = validateFullName(fullName.trim());
    const userErr = validateUsername(username.trim());
    const phoneErr = isValidPhone(phone.trim()) ? null : (t("invalid_phone") || "Phone must be 10 digits starting with 05");
    const pwdErr = validatePassword(password.trim());
    const confirmErr = password.trim() !== confirmPassword.trim() 
      ? (t("passwords_do_not_match") || "Passwords do not match") 
      : null;

    if (nameErr || userErr || phoneErr || pwdErr || confirmErr) {
      const msg = t("please_fix_errors") || "Please fix the errors above";
      setError(msg);
      showModal("error", t("error") || "Error", msg);
      return;
    }

    if (!isValidEmail(email.trim())) {
      const msg = t("invalid_email_address") || "Please enter a valid email address.";
      setError(msg);
      showModal("error", t("sign_up_error") || "Sign up error", msg);
      return;
    }

    // 🔸 Step 2 rules
    if (carTypeTrim.length < 2) {
      const msg = t("car_type_min_chars") || "Car type should be at least 2 characters.";
      setError(msg);
      showModal("error", t("sign_up_error") || "Sign up error", msg);
      return;
    }

    if (!isValidPlateNumber(plateTrim)) {
      const msg = t("plate_number_format_error") || "Plate number should be at least 5 characters and include a digit.";
      setError(msg);
      showModal("error", t("sign_up_error") || "Sign up error", msg);
      return;
    }

    if (!isValidProductionYear(prodYearTrim)) {
      const current = new Date().getFullYear();
      const msg = t("production_year_error") || `Production year must be a valid number between 1990 and ${current + 1}.`;
      setError(msg);
      showModal("error", t("sign_up_error") || "Sign up error", msg);
      return;
    }

    if (!isValidIdNumber(idTrim)) {
      const msg = t("id_number_must_be_9_digits") || t("id_number_format_error") || "ID number must be exactly 9 digits.";
      setError(msg);
      setIdNumberError(msg);
      showModal("error", t("sign_up_error") || "Sign up error", msg);
      return;
    }

    if (!driverLicenseTrim) {
      const msg = t("driver_license_required") || "Driver license image is required.";
      setError(msg);
      showModal("error", t("sign_up_error") || "Sign up error", msg);
      return;
    }

    if (!carLicenseTrim) {
      const msg = t("car_license_required") || "Car license image is required.";
      setError(msg);
      showModal("error", t("sign_up_error") || "Sign up error", msg);
      return;
    }

    if (!carInsuranceTrim) {
      const msg = t("car_insurance_required") || "Car insurance image is required.";
      setError(msg);
      showModal("error", t("sign_up_error") || "Sign up error", msg);
      return;
    }

    try {
      // optional car photos
      const carPhotos: string[] = [];
      if (carPhoto1Url.trim()) carPhotos.push(carPhoto1Url.trim());
      if (carPhoto2Url.trim()) carPhotos.push(carPhoto2Url.trim());

      const res = await fetch(`${API_BASE_URL}/auth/signup/driver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName.trim(),
          username: username.trim(),
          email: email.trim(),
          phone: phone.trim(),
          password: password.trim(),

          // driver docs
          driver_license_image_url: driverLicenseTrim,
          id_card_image_url: idTrim, // ID number string saved here

          // car info
          car_type: carTypeTrim,
          plate_number: plateTrim,
          production_year: Number(prodYearTrim),

          // car docs
          car_license_image_url: carLicenseTrim,
          car_insurance_image_url: carInsuranceTrim,

          // optional car photos
          car_photos_urls: carPhotos,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        if (res.status === 400 || res.status === 409) {
          const msg = t("username_or_email_exists") || "Username or email already exists.";
          setError(msg);
          showModal("error", t("sign_up_error") || "Sign up error", msg);
        } else if (typeof json?.detail === "string") {
          setError(json.detail);
          showModal("error", t("sign_up_error") || "Sign up error", json.detail);
        } else {
          const msg = t("signup_failed_try_again") || "Signup failed. Please try again.";
          setError(msg);
          showModal("error", t("sign_up_error") || "Sign up error", msg);
        }
        return;
      }

      setResult(json);
      showModal(
        "success",
        t("application_sent") || "Application sent",
        t("driver_application_sent") || "Your driver application has been sent for approval."
      );
    } catch (e: any) {
      const msg = (t("network_error") || "Network error: ") + e.message;
      setError(msg);
      showModal("error", t("network_error_message") || "Network error", msg);
    }
  };

  // ----- UI -----
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.subtitle}>{t("driver_signup") || "Driver sign up"}</Text>
      <Text style={styles.stepText}>{t("step") || "Step"} {step} {t("of") || "of"} 2</Text>

      {step === 1 ? (
        <ScrollView
          removeClippedSubviews={true}
          keyboardShouldPersistTaps="handled"
        >
          {/* STEP 1: BASIC INFO */}
          {/* Full Name */}
          <View>
            <TextInput
              style={styles.input}
              value={fullName}
              onChangeText={handleFullNameChange}
              placeholder={t("full_name") || "Full name"}
              placeholderTextColor="#9ab8bd"
            />
            {fullNameError && <Text style={styles.fieldError}>{fullNameError}</Text>}
          </View>

          {/* Username */}
          <View>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={handleUsernameChange}
              placeholder={t("username") || "Username"}
              placeholderTextColor="#9ab8bd"
              autoCapitalize="none"
            />
            {usernameError && <Text style={styles.fieldError}>{usernameError}</Text>}
          </View>

          {/* Email */}
          <View>
            <TextInput
              style={[styles.input, verifiedEmailFromRoute && styles.inputDisabled]}
              value={email}
              onChangeText={verifiedEmailFromRoute ? undefined : setEmail}
              editable={!verifiedEmailFromRoute}
              placeholder={t("email") || "Email"}
              keyboardType="email-address"
              placeholderTextColor="#9ab8bd"
              autoCapitalize="none"
            />
          </View>

          {/* Phone */}
          <View>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={handlePhoneChange}
              placeholder={t("phone") || "Phone"}
              keyboardType="phone-pad"
              maxLength={10}
              placeholderTextColor="#9ab8bd"
            />
            {phoneError && <Text style={styles.fieldError}>{phoneError}</Text>}
          </View>

          {/* Password */}
          <View>
            <View style={styles.passwordInputRow}>
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                <Ionicons 
                  name={showPassword ? "eye-off" : "eye"} 
                  size={20} 
                  color="#9ab8bd" 
                />
              </TouchableOpacity>
              <TextInput
                style={styles.inputFlex}
                value={password}
                onChangeText={handlePasswordChange}
                placeholder={t("password") || "Password"}
                secureTextEntry={!showPassword}
                placeholderTextColor="#9ab8bd"
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

          {/* Confirm Password */}
          <View>
            <View style={styles.passwordInputRow}>
              <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                <Ionicons 
                  name={showConfirmPassword ? "eye-off" : "eye"} 
                  size={20} 
                  color="#9ab8bd" 
                />
              </TouchableOpacity>
              <TextInput
                style={styles.inputFlex}
                value={confirmPassword}
                onChangeText={handleConfirmPasswordChange}
                placeholder={t("confirm_password") || "Confirm password"}
                secureTextEntry={!showConfirmPassword}
                placeholderTextColor="#9ab8bd"
              />
            </View>
            {confirmPasswordError && <Text style={styles.fieldError}>{confirmPasswordError}</Text>}
          </View>

          <TouchableOpacity style={styles.primaryButton} onPress={goToStep2}>
            <Text style={styles.primaryButtonText}>{t("continue") || "Continue"}</Text>
          </TouchableOpacity>

          {onBack && (
            <TouchableOpacity style={styles.secondaryButton} onPress={onBack}>
              <Text style={styles.secondaryButtonText}>{t("back") || "Back"}</Text>
            </TouchableOpacity>
          )}

          {error && <Text style={styles.error}>{error}</Text>}
        </ScrollView>
      ) : (
        <ScrollView
          removeClippedSubviews={true}
          keyboardShouldPersistTaps="handled"
        >
          {/* STEP 2: CAR + DRIVER INFO + FILES */}
          <Text style={styles.sectionTitle}>{t("car_info") || "Car info"}</Text>
          <TextInput
            style={[styles.input, carTypeError && styles.inputError]}
            value={carType}
            onChangeText={handleCarTypeChange}
            placeholder={t("car_type") || "Car type"}
            placeholderTextColor="#9ab8bd"
          />
          {carTypeError && <Text style={styles.fieldError}>{carTypeError}</Text>}
          <TextInput
            style={[styles.input, plateNumberError && styles.inputError]}
            value={plateNumber}
            onChangeText={handlePlateNumberChange}
            placeholder={t("plate_number") || "Plate number"}
            placeholderTextColor="#9ab8bd"
          />
          {plateNumberError && <Text style={styles.fieldError}>{plateNumberError}</Text>}
          <TextInput
            style={[styles.input, productionYearError && styles.inputError]}
            value={productionYear}
            onChangeText={handleProductionYearChange}
            placeholder={t("production_year") || "Production year"}
            keyboardType="numeric"
            placeholderTextColor="#9ab8bd"
          />
          {productionYearError && <Text style={styles.fieldError}>{productionYearError}</Text>}

          <Text style={styles.sectionTitle}>{t("driver_documents") || "Driver documents"}</Text>
          <TextInput
            style={[styles.input, idNumberError && styles.inputError]}
            value={idNumber}
            onChangeText={handleIdNumberChange}
            placeholder={t("id_number_long") || "ID number (9 digits)"}
            keyboardType="numeric"
            maxLength={9}
            placeholderTextColor="#9ab8bd"
          />
          {idNumberError && <Text style={styles.fieldError}>{idNumberError}</Text>}

          <Text style={styles.uploadLabel}>{t("driver_license") || "Driver License"}</Text>
          <TouchableOpacity
            style={styles.uploadButton}
            onPress={uploadDriverLicense}
            disabled={uploadingDriverLicense}
          >
            {uploadingDriverLicense ? (
              <ActivityIndicator color={DARK_TEAL} />
            ) : driverLicenseUrl ? (
              <View style={styles.imagePreviewContainer}>
                <Image 
                  source={{ uri: driverLicenseUrl }} 
                  style={styles.imagePreview}
                  resizeMode="cover"
                  onError={(e) => console.log("Image load error:", e.nativeEvent.error)}
                />
                <Text style={styles.imagePreviewText}>{t("uploaded") || "Uploaded"} ✓</Text>
              </View>
            ) : (
              <Text style={styles.uploadButtonText}>{t("upload_driver_license") || "Upload driver license"}</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.sectionTitle}>{t("car_documents") || "Car documents"}</Text>

          <Text style={styles.uploadLabel}>{t("car_license") || t("upload_car_license") || "Car License"}</Text>
          <TouchableOpacity
            style={styles.uploadButton}
            onPress={uploadCarLicense}
            disabled={uploadingCarLicense}
          >
            {uploadingCarLicense ? (
              <ActivityIndicator color={DARK_TEAL} />
            ) : carLicenseUrl ? (
              <View style={styles.imagePreviewContainer}>
                <Image 
                  source={{ uri: carLicenseUrl }} 
                  style={styles.imagePreview}
                  resizeMode="cover"
                  onError={(e) => console.log("Image load error:", e.nativeEvent.error)}
                />
                <Text style={styles.imagePreviewText}>{t("uploaded") || "Uploaded"} ✓</Text>
              </View>
            ) : (
              <Text style={styles.uploadButtonText}>{t("upload_car_license") || "Upload car license"}</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.uploadLabel}>{t("car_insurance") || t("upload_car_insurance") || "Car Insurance"}</Text>
          <TouchableOpacity
            style={styles.uploadButton}
            onPress={uploadCarInsurance}
            disabled={uploadingCarInsurance}
          >
            {uploadingCarInsurance ? (
              <ActivityIndicator color={DARK_TEAL} />
            ) : carInsuranceUrl ? (
              <View style={styles.imagePreviewContainer}>
                <Image 
                  source={{ uri: carInsuranceUrl }} 
                  style={styles.imagePreview}
                  resizeMode="cover"
                  onError={(e) => console.log("Image load error:", e.nativeEvent.error)}
                />
                <Text style={styles.imagePreviewText}>{t("uploaded") || "Uploaded"} ✓</Text>
              </View>
            ) : (
              <Text style={styles.uploadButtonText}>{t("upload_car_insurance") || "Upload car insurance"}</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.sectionTitle}>{t("car_photos_optional") || "Car photos (optional)"}</Text>

          <Text style={styles.uploadLabel}>{t("car_photo") || t("upload_car_photo") || "Car Photo"} 1</Text>
          <TouchableOpacity
            style={styles.uploadButton}
            onPress={uploadCarPhoto1}
            disabled={uploadingCarPhoto1}
          >
            {uploadingCarPhoto1 ? (
              <ActivityIndicator color={DARK_TEAL} />
            ) : carPhoto1Url ? (
              <View style={styles.imagePreviewContainer}>
                <Image 
                  source={{ uri: carPhoto1Url }} 
                  style={styles.imagePreview}
                  resizeMode="cover"
                  onError={(e) => console.log("Image load error:", e.nativeEvent.error)}
                />
                <Text style={styles.imagePreviewText}>{t("uploaded") || "Uploaded"} ✓</Text>
              </View>
            ) : (
              <Text style={styles.uploadButtonText}>{t("upload_car_photo") || "Upload car photo"} 1</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.uploadLabel}>{t("car_photo") || t("upload_car_photo") || "Car Photo"} 2</Text>
          <TouchableOpacity
            style={styles.uploadButton}
            onPress={uploadCarPhoto2}
            disabled={uploadingCarPhoto2}
          >
            {uploadingCarPhoto2 ? (
              <ActivityIndicator color={DARK_TEAL} />
            ) : carPhoto2Url ? (
              <View style={styles.imagePreviewContainer}>
                <Image source={{ uri: carPhoto2Url }} style={styles.imagePreview} />
                <Text style={styles.imagePreviewText}>{t("uploaded") || "Uploaded"} ✓</Text>
              </View>
            ) : (
              <Text style={styles.uploadButtonText}>{t("upload_car_photo") || "Upload car photo"} 2</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.primaryButton, { marginTop: 16 }]}
            onPress={signupDriver}
          >
            <Text style={styles.primaryButtonText}>{t("submit_for_approval") || "Submit for approval"}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => setStep(1)}
          >
            <Text style={styles.secondaryButtonText}>
              {t("back_to_previous_step") || "Back to previous step"}
            </Text>
          </TouchableOpacity>

          {error && <Text style={styles.error}>{error}</Text>}
        </ScrollView>
      )}

      {/* pretty popup for errors / success */}
      <MessageModal
        visible={modalVisible}
        type={modalType}
        title={modalTitle}
        message={modalMessage}
        onClose={() => {
          setModalVisible(false);
          // If success modal, navigate to Home or Login
          if (modalType === "success" && navigation) {
            try {
              // Reset navigation stack and go to Home
              if (navigation.reset) {
                navigation.reset({
                  index: 0,
                  routes: [{ name: "Home" }],
                });
              } else if (navigation.navigate) {
                navigation.navigate("Home");
              }
            } catch (e) {
              console.log("Navigation error:", e);
            }
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    fontSize: 16,
    fontWeight: "600",
    color: DARK_TEAL,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 4,
  },
  stepText: {
    fontSize: 13,
    color: "#7a98a0",
    textAlign: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    marginTop: 12,
    marginBottom: 6,
    fontWeight: "600",
    color: DARK_TEAL,
    fontSize: 14,
  },
  input: {
    backgroundColor: "#f5fdff",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#d6ebee",
    marginBottom: 10,
    fontSize: 14,
    color: "#234348",
    textAlign: "right",
  },
  inputDisabled: {
    opacity: 0.6,
    backgroundColor: "#e8f4f6",
  },
  primaryButton: {
    marginTop: 4,
    backgroundColor: DARK_TEAL,
    borderRadius: 24,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButton: {
    marginTop: 10,
    borderRadius: 24,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: DARK_TEAL,
  },
  secondaryButtonText: {
    color: DARK_TEAL,
    fontSize: 15,
    fontWeight: "600",
  },
  smallButton: {
    alignSelf: "flex-start",
    backgroundColor: MINT,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 6,
  },
  smallButtonText: {
    color: DARK_TEAL,
    fontSize: 12,
    fontWeight: "600",
  },
  success: {
    marginTop: 10,
    color: "green",
    fontSize: 12,
  },
  error: {
    marginTop: 10,
    color: "red",
    fontSize: 12,
  },
  passwordInputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f5fdff",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#d6ebee",
    marginBottom: 10,
  },
  inputFlex: {
    flex: 1,
    fontSize: 14,
    color: "#234348",
    marginLeft: 8,
    textAlign: "right",
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
    marginTop: -8,
    marginBottom: 8,
    textAlign: "right",
  },
  inputError: {
    borderColor: "#d7263d",
    borderWidth: 1,
  },
  uploadLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: DARK_TEAL,
    marginTop: 8,
    marginBottom: 6,
  },
  uploadButton: {
    borderWidth: 2,
    borderColor: MINT,
    borderStyle: "dashed",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    backgroundColor: "#f5fdff",
    minHeight: 60,
  },
  uploadButtonText: {
    color: DARK_TEAL,
    fontWeight: "600",
    fontSize: 14,
  },
  imagePreviewContainer: {
    alignItems: "center",
    width: "100%",
  },
  imagePreview: {
    width: 200,
    height: 150,
    borderRadius: 8,
    marginBottom: 8,
    resizeMode: "cover",
    backgroundColor: "#f0f0f0",
  },
  imagePreviewText: {
    color: "#4CAF50",
    fontWeight: "600",
    fontSize: 12,
  },
});