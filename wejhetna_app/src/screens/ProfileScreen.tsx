// src/screens/ProfileScreen.tsx

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  TextInput,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useNavigation, useRoute, CommonActions } from "@react-navigation/native";
import Ionicons from "react-native-vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Accordion from "../components/Accordion";
import SimpleLanguageSwitcher from "../components/SimpleLanguageSwitcher";
import {
  getUserProfile,
  getDriverProfile,
  getBusinessOwnerProfile,
  UserProfile,
  DriverProfileInfo,
  BusinessOwnerProfileInfo,
} from "../api/profileApi";

const DARK_TEAL = "#0f5b63";
const SOFT_TEAL = "#3a8d96";
const MINT = "#9bd3d8";

export default function ProfileScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const route = useRoute();
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [driverInfo, setDriverInfo] = useState<DriverProfileInfo | null>(null);
  const [businessInfo, setBusinessInfo] =
    useState<BusinessOwnerProfileInfo | null>(null);
  const [userId, setUserId] = useState<number | null>(null);
  
  // Password change state
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState<{
    current?: string;
    new?: string;
    confirm?: string;
  }>({});
  const [changingPassword, setChangingPassword] = useState(false);
  
  // Phone change state (for regular users, drivers, and business owners)
  const [showPhoneChange, setShowPhoneChange] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | undefined>(undefined);
  const [changingPhone, setChangingPhone] = useState(false);
  
  // Business phone change state (for business owners)
  const [showBusinessPhoneChange, setShowBusinessPhoneChange] = useState(false);
  const [newBusinessPhone, setNewBusinessPhone] = useState("");
  const [businessPhoneError, setBusinessPhoneError] = useState<string | undefined>(undefined);
  const [changingBusinessPhone, setChangingBusinessPhone] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      setLoading(true);
      
      // Try to get userId from route params or AsyncStorage
      let currentUserId: number | null = null;
      
      // Check route params first
      const params = route.params as any;
      if (params?.userId) {
        currentUserId = params.userId;
      } else {
        // Try to get from AsyncStorage (if stored during login)
        const storedUserId = await AsyncStorage.getItem("userId");
        if (storedUserId) {
          currentUserId = parseInt(storedUserId, 10);
        }
      }

      if (!currentUserId) {
        Alert.alert(
          t("error") || "Error",
          t("error_loading_profile") || "Could not load profile"
        );
        setLoading(false);
        return;
      }

      setUserId(currentUserId);

      // Load basic user profile
      const profile = await getUserProfile(currentUserId);
      setUserProfile(profile);

      // Load role-specific data
      if (profile.role === "DRIVER") {
        try {
          const driverData = await getDriverProfile(currentUserId);
          setDriverInfo(driverData);
        } catch (err) {
          console.log("Could not load driver info:", err);
        }
      } else if (profile.role === "BUSINESS_OWNER") {
        try {
          const businessData = await getBusinessOwnerProfile(currentUserId);
          setBusinessInfo(businessData);
        } catch (err) {
          console.log("Could not load business info:", err);
        }
      }
    } catch (error: any) {
      console.error("Error loading profile:", error);
      Alert.alert(
        t("error") || "Error",
        t("error_loading_profile") || "Failed to load profile"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      t("logout") || "Logout",
      t("logout_confirmation") || "Are you sure you want to logout?",
      [
        {
          text: t("no") || "No",
          style: "cancel",
        },
        {
          text: t("yes") || "Yes",
          style: "destructive",
          onPress: async () => {
            try {
              // Clear ALL stored data
              await AsyncStorage.clear();
              
              // Get root navigator to reset entire navigation stack
              const rootNavigation = navigation.getParent()?.getParent() || navigation.getParent() || navigation;
              
              // Reset navigation stack completely - prevents going back
              rootNavigation.dispatch(
                CommonActions.reset({
                  index: 0,
                  routes: [{ name: "Home" as never }],
                })
              );
            } catch (error) {
              console.error("Logout error:", error);
              // Even if there's an error, try to navigate to home
              const rootNavigation = navigation.getParent()?.getParent() || navigation.getParent() || navigation;
              rootNavigation.dispatch(
                CommonActions.reset({
                  index: 0,
                  routes: [{ name: "Home" as never }],
                })
              );
            }
          },
        },
      ]
    );
  };

  const getStatusText = (status: string) => {
    switch (status.toUpperCase()) {
      case "ACTIVE":
        return t("active") || "Active";
      case "PENDING":
        return t("pending") || "Pending";
      case "REJECTED":
        return t("rejected") || "Rejected";
      default:
        return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toUpperCase()) {
      case "ACTIVE":
        return "#28a745";
      case "PENDING":
        return "#ffc107";
      case "REJECTED":
        return "#dc3545";
      default:
        return DARK_TEAL;
    }
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

  const handleChangeBusinessPhone = async () => {
    // Clear previous errors
    setBusinessPhoneError(undefined);

    // Validate phone number
    if (!newBusinessPhone.trim()) {
      setBusinessPhoneError(t("phone_required") || "Phone number is required");
      return;
    }

    // Phone validation (exactly 10 digits starting with 05)
    const phoneCleaned = newBusinessPhone.trim().replace(/[^\d]/g, "");
    if (phoneCleaned.length !== 10) {
      setBusinessPhoneError(t("phone_must_be_10_digits") || "Phone number must be exactly 10 digits");
      return;
    }
    if (!phoneCleaned.startsWith('05')) {
      setBusinessPhoneError(t("phone_must_start_with_05") || "Phone number must start with 05");
      return;
    }

    // Check if phone is the same
    if (newBusinessPhone.trim() === businessInfo?.place?.phone) {
      setBusinessPhoneError(t("phone_same_as_current") || "New phone number is the same as current phone number");
      return;
    }

    // Check if place exists and has a valid ID (not 0, which means no actual place record yet)
    if (!businessInfo?.place || !businessInfo.place.id || businessInfo.place.id === 0) {
      console.error("Business place ID is missing or invalid. businessInfo:", businessInfo);
      console.error("Place object:", businessInfo?.place);
      console.error("Place ID:", businessInfo?.place?.id);
      setBusinessPhoneError(
        t("place_not_approved") || 
        "Your business place request is still pending approval. Please wait for approval before updating the phone number."
      );
      return;
    }

    try {
      setChangingBusinessPhone(true);

      const API_BASE_URL = "http://10.0.2.2:8000";
      const placeId = businessInfo.place.id;
      console.log("Updating business phone for place ID:", placeId);
      console.log("New phone:", newBusinessPhone.trim());
      
      const res = await fetch(`${API_BASE_URL}/places/${placeId}/phone`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          new_phone: newBusinessPhone.trim(),
        }),
      });

      // Check if response is ok before parsing JSON
      if (!res.ok) {
        console.log("API response not OK. Status:", res.status);
        let errorMsg = t("phone_update_failed") || "Failed to update phone number";
        
        try {
          const json = await res.json();
          console.log("Error response JSON:", json);
          errorMsg = json?.detail || errorMsg;
        } catch (parseError) {
          console.log("Failed to parse error response:", parseError);
          // If JSON parsing fails, use status-based error message
          if (res.status === 404) {
            errorMsg = t("place_not_found") || "Business place not found. The place may have been deleted.";
          } else if (res.status === 400) {
            errorMsg = t("phone_invalid_format") || "Phone number format is invalid";
          } else {
            errorMsg = t("phone_update_failed") || `Failed to update phone number (Status: ${res.status})`;
          }
        }
        
        // Translate common error messages
        if (errorMsg.includes("same as current")) {
          errorMsg = t("phone_same_as_current") || "New phone number is the same as current phone number";
        } else if (errorMsg.includes("exactly 10 digits")) {
          errorMsg = t("phone_must_be_10_digits") || "Phone number must be exactly 10 digits";
        } else if (errorMsg.includes("start with 05")) {
          errorMsg = t("phone_must_start_with_05") || "Phone number must start with 05";
        } else if (errorMsg.includes("must be") || errorMsg.includes("digits")) {
          errorMsg = t("phone_invalid_format") || "Phone number format is invalid";
        }
        
        setBusinessPhoneError(errorMsg);
        return;
      }

      // Parse JSON for successful response
      const json = await res.json();
      console.log("Success response:", json);

      // Success - update local state directly instead of reloading
      if (businessInfo?.place) {
        setBusinessInfo({
          ...businessInfo,
          place: {
            ...businessInfo.place,
            phone: newBusinessPhone.trim(),
          },
        });
      }
      
      // Reset form
      setShowBusinessPhoneChange(false);
      setNewBusinessPhone("");
      setBusinessPhoneError(undefined);
      
      Alert.alert(
        t("success") || "Success",
        t("business_phone_updated_successfully") || "Business phone number has been updated successfully",
        [{ text: t("ok") || "OK" }]
      );
    } catch (error: any) {
      console.error("Error updating business phone:", error);
      let errorMsg = t("phone_update_failed") || "Failed to update phone number";
      
      if (error?.message) {
        if (error.message.includes("JSON") || error.message.includes("parse")) {
          errorMsg = t("phone_update_failed") || "Failed to update phone number";
        } else if (error.message.includes("Network") || error.message.includes("fetch")) {
          errorMsg = t("network_error") || "Network error occurred. Please check your connection.";
        } else {
          errorMsg = error.message;
        }
      }
      
      // Show error in the input field, not as an alert
      setBusinessPhoneError(errorMsg);
    } finally {
      setChangingBusinessPhone(false);
    }
  };

  const handleChangePhone = async () => {
    // Clear previous errors
    setPhoneError(undefined);

    // Validate phone number
    if (!newPhone.trim()) {
      setPhoneError(t("phone_required") || "Phone number is required");
      return;
    }

    // Phone validation (exactly 10 digits starting with 05)
    const phoneCleaned = newPhone.trim().replace(/[^\d]/g, "");
    if (phoneCleaned.length !== 10) {
      setPhoneError(t("phone_must_be_10_digits") || "Phone number must be exactly 10 digits");
      return;
    }
    if (!phoneCleaned.startsWith('05')) {
      setPhoneError(t("phone_must_start_with_05") || "Phone number must start with 05");
      return;
    }

    // Check if phone is the same
    if (newPhone.trim() === userProfile?.phone) {
      setPhoneError(t("phone_same_as_current") || "New phone number is the same as current phone number");
      return;
    }

    if (!userId) {
      Alert.alert(t("error") || "Error", t("error_loading_profile") || "User ID not found");
      return;
    }

    try {
      setChangingPhone(true);

      const API_BASE_URL = "http://10.0.2.2:8000";
      const res = await fetch(`${API_BASE_URL}/users/${userId}/phone`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          new_phone: newPhone.trim(),
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        let errorMsg = json?.detail || t("phone_update_failed") || "Failed to update phone number";
        
        // Translate common error messages
        if (errorMsg.includes("already in use") || errorMsg.includes("already exists")) {
          errorMsg = t("phone_already_in_use") || "This phone number is already in use by another user";
        } else if (errorMsg.includes("same as current")) {
          errorMsg = t("phone_same_as_current") || "New phone number is the same as current phone number";
        } else if (errorMsg.includes("exactly 10 digits")) {
          errorMsg = t("phone_must_be_10_digits") || "Phone number must be exactly 10 digits";
        } else if (errorMsg.includes("start with 05")) {
          errorMsg = t("phone_must_start_with_05") || "Phone number must start with 05";
        } else if (errorMsg.includes("must be") || errorMsg.includes("digits")) {
          errorMsg = t("phone_invalid_format") || "Phone number format is invalid";
        }
        
        setPhoneError(errorMsg);
        return;
      }

      // Success - update local state directly instead of reloading
      if (userProfile) {
        setUserProfile({
          ...userProfile,
          phone: newPhone.trim(),
        });
      }
      
      // Reset form
      setShowPhoneChange(false);
      setNewPhone("");
      setPhoneError(undefined);
      
      Alert.alert(
        t("success") || "Success",
        t("phone_updated_successfully") || "Phone number has been updated successfully",
        [{ text: t("ok") || "OK" }]
      );
    } catch (error: any) {
      setPhoneError(t("network_error") || error?.message || "Network error occurred");
    } finally {
      setChangingPhone(false);
    }
  };

  const handleChangePassword = async () => {
    // Clear previous errors
    setPasswordErrors({});

    // Validate current password
    if (!currentPassword.trim()) {
      setPasswordErrors({ current: t("current_password_required") || "Current password is required" });
      return;
    }

    // Validate new password
    const newPwdError = validatePassword(newPassword);
    if (newPwdError) {
      setPasswordErrors({ new: newPwdError });
      return;
    }

    // Validate passwords match
    if (newPassword !== confirmPassword) {
      setPasswordErrors({ confirm: t("passwords_do_not_match") || "Passwords do not match" });
      return;
    }

    if (!userId) {
      Alert.alert(t("error") || "Error", t("error_loading_profile") || "User ID not found");
      return;
    }

    try {
      setChangingPassword(true);

      const API_BASE_URL = "http://10.0.2.2:8000";
      const res = await fetch(`${API_BASE_URL}/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          current_password: currentPassword.trim(),
          new_password: newPassword.trim(),
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        let errorMsg = json?.detail || t("password_change_failed") || "Failed to change password";
        
        // Translate common error messages
        if (errorMsg.includes("Current password is incorrect") || errorMsg.includes("incorrect")) {
          errorMsg = t("current_password_incorrect") || "Current password is incorrect";
        } else if (errorMsg.includes("must be at least 8 characters")) {
          errorMsg = t("password_too_short") || "Password must be at least 8 characters";
        } else if (errorMsg.includes("uppercase")) {
          errorMsg = t("password_no_uppercase") || "Password must contain at least one uppercase letter";
        } else if (errorMsg.includes("lowercase")) {
          errorMsg = t("password_no_lowercase") || "Password must contain at least one lowercase letter";
        } else if (errorMsg.includes("number")) {
          errorMsg = t("password_no_number") || "Password must contain at least one number";
        } else if (errorMsg.includes("symbol")) {
          errorMsg = t("password_no_symbol") || "Password must contain at least one symbol";
        } else if (errorMsg.includes("different from current")) {
          errorMsg = t("new_password_same_as_current") || "New password must be different from current password";
        }
        
        Alert.alert(t("error") || "Error", errorMsg);
        return;
      }

      // Success
      Alert.alert(
        t("success") || "Success",
        t("password_changed_successfully") || "Password has been changed successfully",
        [
          {
            text: t("ok") || "OK",
            onPress: () => {
              // Reset form
              setCurrentPassword("");
              setNewPassword("");
              setConfirmPassword("");
              setShowPasswordChange(false);
              setPasswordErrors({});
            },
          },
        ]
      );
    } catch (error: any) {
      Alert.alert(
        t("error") || "Error",
        t("network_error") || error?.message || "Network error occurred"
      );
    } finally {
      setChangingPassword(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={DARK_TEAL} />
        <Text style={styles.loadingText}>
          {t("loading_profile") || "Loading profile..."}
        </Text>
      </View>
    );
  }

  if (!userProfile) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>
          {t("error_loading_profile") || "Failed to load profile"}
        </Text>
      </View>
    );
  }

  // Check if we're in a tab navigator (no back button needed)
  const isInTabNavigator = navigation.getParent()?.getState()?.type === 'tab';

  return (
    <View style={styles.container}>
      {/* Simple Header */}
      <View style={styles.header}>
        {!isInTabNavigator && (
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
        )}
        <Text style={styles.headerTitle}>{t("profile") || "Profile"}</Text>
        {!isInTabNavigator && <View style={styles.headerSpacer} />}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Simple Profile Header - Horizontal Layout */}
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={50} color={DARK_TEAL} />
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.userName}>{userProfile.full_name}</Text>
            <Text style={styles.userEmail}>{userProfile.email}</Text>
          </View>
        </View>
        
        {/* Accordion Sections Container */}
        <View style={styles.sectionsContainer}>

            {/* Personal Information */}
            <Accordion
              title={t("personal_information") || "Personal Information"}
              icon="person-outline"
              defaultOpen={true}
            >
              <View style={styles.infoItem}>
                <View style={styles.infoItemHeader}>
                  <Ionicons name="person" size={20} color="#666" />
                  <Text style={styles.infoLabel}>{t("full_name") || "Full Name"}</Text>
                </View>
                <Text style={styles.infoValue}>{userProfile.full_name}</Text>
              </View>
              
              <View style={styles.infoItem}>
                <View style={styles.infoItemHeader}>
                  <Ionicons name="at" size={20} color="#666" />
                  <Text style={styles.infoLabel}>{t("username") || "Username"}</Text>
                </View>
                <Text style={styles.infoValue}>{userProfile.username}</Text>
              </View>
              
              <View style={styles.infoItem}>
                <View style={styles.infoItemHeader}>
                  <Ionicons name="mail" size={20} color="#666" />
                  <Text style={styles.infoLabel}>{t("email") || "Email"}</Text>
                </View>
                <Text style={styles.infoValue}>{userProfile.email}</Text>
              </View>
              
              <View style={styles.infoItem}>
                <View style={styles.infoItemHeader}>
                  <Ionicons name="call" size={20} color="#666" />
                  <Text style={styles.infoLabel}>{t("phone") || "Phone"}</Text>
                </View>
                
                {/* Phone editing - for regular users, drivers, and business owners */}
                {(userProfile.role === "REGULAR" || userProfile.role === "DRIVER" || userProfile.role === "BUSINESS_OWNER") ? (
                  !showPhoneChange ? (
                    <View style={styles.phoneDisplayContainer}>
                      <Text style={styles.infoValue}>{userProfile.phone}</Text>
                      <TouchableOpacity
                        style={styles.editPhoneButton}
                        onPress={() => {
                          setShowPhoneChange(true);
                          setNewPhone(userProfile.phone);
                          setPhoneError(undefined);
                        }}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="create-outline" size={18} color="#666" />
                        <Text style={styles.editPhoneButtonText}>
                          {t("edit") || "Edit"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.phoneChangeForm}>
                      <View style={styles.passwordInputWrapper}>
                        <TextInput
                          style={[styles.passwordInput, phoneError && styles.inputError]}
                          value={newPhone}
                          onChangeText={(text) => {
                            setNewPhone(text);
                            if (phoneError) {
                              setPhoneError(undefined);
                            }
                          }}
                          placeholder={t("enter_new_phone") || "Enter new phone number"}
                          keyboardType="phone-pad"
                          placeholderTextColor="#999"
                        />
                      </View>
                      {phoneError && (
                        <Text style={styles.errorText}>{phoneError}</Text>
                      )}
                      
                      <View style={styles.passwordChangeActions}>
                        <TouchableOpacity
                          style={styles.cancelPasswordButton}
                          onPress={() => {
                            setShowPhoneChange(false);
                            setNewPhone("");
                            setPhoneError(undefined);
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.cancelPasswordButtonText}>
                            {t("cancel") || "Cancel"}
                          </Text>
                        </TouchableOpacity>
                        
                        <TouchableOpacity
                          style={[styles.savePasswordButton, changingPhone && styles.buttonDisabled]}
                          onPress={handleChangePhone}
                          activeOpacity={0.7}
                          disabled={changingPhone}
                        >
                          {changingPhone ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <Text style={styles.savePasswordButtonText}>
                              {t("save") || "Save"}
                            </Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  )
                ) : (
                  <Text style={styles.infoValue}>{userProfile.phone}</Text>
                )}
              </View>
            </Accordion>

            {/* Driver Vehicle Information */}
            {userProfile.role === "DRIVER" && (
              <Accordion
                title={t("vehicle_information") || "Vehicle Information"}
                icon="car-outline"
              >
                {driverInfo?.vehicle ? (
                  <>
                    <View style={styles.infoItem}>
                      <View style={styles.infoItemHeader}>
                        <Ionicons name="car" size={20} color="#666" />
                        <Text style={styles.infoLabel}>{t("car_type") || "Car Type"}</Text>
                      </View>
                      <Text style={styles.infoValue}>{driverInfo.vehicle.car_type}</Text>
                    </View>
                    
                    <View style={styles.infoItem}>
                      <View style={styles.infoItemHeader}>
                        <Ionicons name="document-text" size={20} color="#666" />
                        <Text style={styles.infoLabel}>{t("plate_number") || "Plate Number"}</Text>
                      </View>
                      <Text style={styles.infoValue}>{driverInfo.vehicle.plate_number}</Text>
                    </View>
                    
                    <View style={styles.infoItem}>
                      <View style={styles.infoItemHeader}>
                        <Ionicons name="calendar" size={20} color="#666" />
                        <Text style={styles.infoLabel}>{t("production_year") || "Production Year"}</Text>
                      </View>
                      <Text style={styles.infoValue}>{driverInfo.vehicle.production_year}</Text>
                    </View>
                    
                    {driverInfo.vehicle.car_license_image_url && (
                      <View style={styles.infoItem}>
                        <View style={styles.infoItemHeader}>
                          <Ionicons name="document" size={20} color="#666" />
                          <Text style={styles.infoLabel}>{t("car_license") || "Car License"}</Text>
                        </View>
                        <Image
                          source={{ uri: driverInfo.vehicle.car_license_image_url }}
                          style={styles.documentImage}
                          resizeMode="cover"
                        />
                      </View>
                    )}
                    
                    {driverInfo.vehicle.car_insurance_image_url && (
                      <View style={styles.infoItem}>
                        <View style={styles.infoItemHeader}>
                          <Ionicons name="shield-checkmark" size={20} color="#666" />
                          <Text style={styles.infoLabel}>{t("car_insurance") || "Car Insurance"}</Text>
                        </View>
                        <Image
                          source={{ uri: driverInfo.vehicle.car_insurance_image_url }}
                          style={styles.documentImage}
                          resizeMode="cover"
                        />
                      </View>
                    )}
                    
                    {driverInfo.vehicle.car_photos_urls &&
                      driverInfo.vehicle.car_photos_urls.length > 0 && (
                        <View style={styles.infoItem}>
                          <View style={styles.infoItemHeader}>
                            <Ionicons name="images" size={20} color="#666" />
                            <Text style={styles.infoLabel}>{t("car_photos") || "Car Photos"}</Text>
                          </View>
                          <View style={styles.photosContainer}>
                            {driverInfo.vehicle.car_photos_urls.map((url, idx) => (
                              <Image
                                key={idx}
                                source={{ uri: url }}
                                style={styles.photo}
                                resizeMode="cover"
                              />
                            ))}
                          </View>
                        </View>
                      )}
                  </>
                ) : (
                  <View style={styles.emptyState}>
                    <Ionicons name="car-outline" size={48} color="#ccc" />
                    <Text style={styles.emptyStateText}>
                      {t("no_vehicle_info") || "No vehicle information available"}
                    </Text>
                  </View>
                )}
              </Accordion>
            )}

            {/* Business Owner Information */}
            {userProfile.role === "BUSINESS_OWNER" && (
              <Accordion
                title={t("business_information") || "Business Information"}
                icon="business-outline"
              >
                {businessInfo?.place ? (
                  <>
                    <View style={styles.infoItem}>
                      <View style={styles.infoItemHeader}>
                        <Ionicons name="business" size={20} color="#666" />
                        <Text style={styles.infoLabel}>{t("business_name") || "Business Name"}</Text>
                      </View>
                      <Text style={styles.infoValue}>{businessInfo.place.name}</Text>
                    </View>
                    
                    {businessInfo.place.city_name && (
                      <View style={styles.infoItem}>
                        <View style={styles.infoItemHeader}>
                          <Ionicons name="location" size={20} color="#666" />
                          <Text style={styles.infoLabel}>{t("city") || "City"}</Text>
                        </View>
                        <Text style={styles.infoValue}>{businessInfo.place.city_name}</Text>
                      </View>
                    )}
                    
                    {businessInfo.place.category_name && (
                      <View style={styles.infoItem}>
                        <View style={styles.infoItemHeader}>
                          <Ionicons name="grid" size={20} color="#666" />
                          <Text style={styles.infoLabel}>{t("category") || "Category"}</Text>
                        </View>
                        <Text style={styles.infoValue}>{businessInfo.place.category_name}</Text>
                      </View>
                    )}
                    
                    {businessInfo.place.description && (
                      <View style={styles.infoItem}>
                        <View style={styles.infoItemHeader}>
                          <Ionicons name="document-text" size={20} color="#666" />
                          <Text style={styles.infoLabel}>{t("description") || "Description"}</Text>
                        </View>
                        <Text style={styles.infoValue}>{businessInfo.place.description}</Text>
                      </View>
                    )}
                    
                    {businessInfo.place.phone !== undefined && (
                      <View style={styles.infoItem}>
                        <View style={styles.infoItemHeader}>
                          <Ionicons name="call" size={20} color="#666" />
                          <Text style={styles.infoLabel}>{t("phone") || "Phone"}</Text>
                        </View>
                        
                        {!showBusinessPhoneChange ? (
                          <View style={styles.phoneDisplayContainer}>
                            <Text style={styles.infoValue}>{businessInfo.place.phone || t("no_phone") || "No phone"}</Text>
                            <TouchableOpacity
                              style={styles.editPhoneButton}
                              onPress={() => {
                                setShowBusinessPhoneChange(true);
                                setNewBusinessPhone(businessInfo.place?.phone || "");
                                setBusinessPhoneError(undefined);
                              }}
                              activeOpacity={0.7}
                            >
                              <Ionicons name="create-outline" size={18} color="#666" />
                              <Text style={styles.editPhoneButtonText}>
                                {t("edit") || "Edit"}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <View style={styles.phoneChangeForm}>
                            <View style={styles.passwordInputWrapper}>
                              <TextInput
                                style={[styles.passwordInput, businessPhoneError && styles.inputError]}
                                value={newBusinessPhone}
                                onChangeText={(text) => {
                                  setNewBusinessPhone(text);
                                  if (businessPhoneError) {
                                    setBusinessPhoneError(undefined);
                                  }
                                }}
                                placeholder={t("enter_new_phone") || "Enter new phone number"}
                                keyboardType="phone-pad"
                                placeholderTextColor="#999"
                              />
                            </View>
                            {businessPhoneError && (
                              <Text style={styles.errorText}>{businessPhoneError}</Text>
                            )}
                            
                            <View style={styles.passwordChangeActions}>
                              <TouchableOpacity
                                style={styles.cancelPasswordButton}
                                onPress={() => {
                                  setShowBusinessPhoneChange(false);
                                  setNewBusinessPhone("");
                                  setBusinessPhoneError(undefined);
                                }}
                                activeOpacity={0.7}
                              >
                                <Text style={styles.cancelPasswordButtonText}>
                                  {t("cancel") || "Cancel"}
                                </Text>
                              </TouchableOpacity>
                              
                              <TouchableOpacity
                                style={[styles.savePasswordButton, changingBusinessPhone && styles.buttonDisabled]}
                                onPress={handleChangeBusinessPhone}
                                activeOpacity={0.7}
                                disabled={changingBusinessPhone}
                              >
                                {changingBusinessPhone ? (
                                  <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                  <Text style={styles.savePasswordButtonText}>
                                    {t("save") || "Save"}
                                  </Text>
                                )}
                              </TouchableOpacity>
                            </View>
                          </View>
                        )}
                      </View>
                    )}
                    
                    {businessInfo.place.opening_hours && (
                      <View style={styles.infoItem}>
                        <View style={styles.infoItemHeader}>
                          <Ionicons name="time" size={20} color="#666" />
                          <Text style={styles.infoLabel}>{t("opening_hours") || "Opening Hours"}</Text>
                        </View>
                        <Text style={styles.infoValue}>{businessInfo.place.opening_hours}</Text>
                      </View>
                    )}
                    
                    {businessInfo.place.lat && businessInfo.place.lon && (
                      <View style={styles.infoItem}>
                        <View style={styles.infoItemHeader}>
                          <Ionicons name="map" size={20} color="#666" />
                          <Text style={styles.infoLabel}>{t("location") || "Location"}</Text>
                        </View>
                        <Text style={styles.infoValue}>
                          {businessInfo.place.lat.toFixed(6)}, {businessInfo.place.lon.toFixed(6)}
                        </Text>
                      </View>
                    )}
                  </>
                ) : (
                  <View style={styles.emptyState}>
                    <Ionicons name="business-outline" size={48} color="#ccc" />
                    <Text style={styles.emptyStateText}>
                      {t("no_business_info") || "No business information available"}
                    </Text>
                  </View>
                )}
              </Accordion>
            )}

            {/* Account Settings */}
            <Accordion
              title={t("account_settings") || "Account Settings"}
              icon="settings-outline"
            >
              <View style={styles.infoItem}>
                <View style={styles.infoItemHeader}>
                  <Ionicons name="language" size={20} color="#666" />
                  <Text style={styles.infoLabel}>
                    {t("change_language") || "Change Language"}
                  </Text>
                </View>
                <View style={styles.languageSwitcherWrapper}>
                  <SimpleLanguageSwitcher />
                </View>
              </View>

              {/* Change Password Section */}
              <View style={styles.infoItem}>
                <View style={styles.infoItemHeader}>
                  <Ionicons name="lock-closed" size={20} color="#666" />
                  <Text style={styles.infoLabel}>
                    {t("change_password") || "Change Password"}
                  </Text>
                </View>
                
                {!showPasswordChange ? (
                  <TouchableOpacity
                    style={styles.changePasswordButton}
                    onPress={() => setShowPasswordChange(true)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.changePasswordButtonText}>
                      {t("change_password") || "Change Password"}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.passwordChangeForm}>
                    {/* Current Password */}
                    <View style={styles.passwordInputContainer}>
                      <Text style={styles.passwordLabel}>
                        {t("current_password") || "Current Password"}
                      </Text>
                      <View style={styles.passwordInputWrapper}>
                        <TextInput
                          style={[styles.passwordInput, passwordErrors.current && styles.inputError]}
                          value={currentPassword}
                          onChangeText={(text) => {
                            setCurrentPassword(text);
                            if (passwordErrors.current) {
                              setPasswordErrors({ ...passwordErrors, current: undefined });
                            }
                          }}
                          placeholder={t("enter_current_password") || "Enter current password"}
                          secureTextEntry={!showCurrentPassword}
                          placeholderTextColor="#999"
                        />
                        <TouchableOpacity
                          style={styles.eyeIcon}
                          onPress={() => setShowCurrentPassword(!showCurrentPassword)}
                        >
                          <Ionicons
                            name={showCurrentPassword ? "eye-off" : "eye"}
                            size={20}
                            color="#666"
                          />
                        </TouchableOpacity>
                      </View>
                      {passwordErrors.current && (
                        <Text style={styles.errorText}>{passwordErrors.current}</Text>
                      )}
                    </View>

                    {/* New Password */}
                    <View style={styles.passwordInputContainer}>
                      <Text style={styles.passwordLabel}>
                        {t("new_password") || "New Password"}
                      </Text>
                      <View style={styles.passwordInputWrapper}>
                        <TextInput
                          style={[styles.passwordInput, passwordErrors.new && styles.inputError]}
                          value={newPassword}
                          onChangeText={(text) => {
                            setNewPassword(text);
                            if (passwordErrors.new) {
                              setPasswordErrors({ ...passwordErrors, new: undefined });
                            }
                            // Clear confirm error if passwords match
                            if (text === confirmPassword && passwordErrors.confirm) {
                              setPasswordErrors({ ...passwordErrors, confirm: undefined });
                            }
                          }}
                          placeholder={t("enter_new_password") || "Enter new password"}
                          secureTextEntry={!showNewPassword}
                          placeholderTextColor="#999"
                        />
                        <TouchableOpacity
                          style={styles.eyeIcon}
                          onPress={() => setShowNewPassword(!showNewPassword)}
                        >
                          <Ionicons
                            name={showNewPassword ? "eye-off" : "eye"}
                            size={20}
                            color="#666"
                          />
                        </TouchableOpacity>
                      </View>
                      
                      {/* Password Requirements Checklist */}
                      {newPassword.length > 0 && (
                        <View style={styles.passwordRequirements}>
                          {!passwordMeetsLength(newPassword) && (
                            <View style={styles.requirementItem}>
                              <Ionicons name="close-circle" size={16} color="#d7263d" />
                              <Text style={styles.requirementText}>
                                {t("password_req_length") || "At least 8 characters"}
                              </Text>
                            </View>
                          )}
                          {!passwordMeetsUppercase(newPassword) && (
                            <View style={styles.requirementItem}>
                              <Ionicons name="close-circle" size={16} color="#d7263d" />
                              <Text style={styles.requirementText}>
                                {t("password_req_uppercase") || "Uppercase letter"}
                              </Text>
                            </View>
                          )}
                          {!passwordMeetsLowercase(newPassword) && (
                            <View style={styles.requirementItem}>
                              <Ionicons name="close-circle" size={16} color="#d7263d" />
                              <Text style={styles.requirementText}>
                                {t("password_req_lowercase") || "Lowercase letter"}
                              </Text>
                            </View>
                          )}
                          {!passwordMeetsNumber(newPassword) && (
                            <View style={styles.requirementItem}>
                              <Ionicons name="close-circle" size={16} color="#d7263d" />
                              <Text style={styles.requirementText}>
                                {t("password_req_number") || "Number"}
                              </Text>
                            </View>
                          )}
                          {!passwordMeetsSymbol(newPassword) && (
                            <View style={styles.requirementItem}>
                              <Ionicons name="close-circle" size={16} color="#d7263d" />
                              <Text style={styles.requirementText}>
                                {t("password_req_symbol") || "Symbol"}
                              </Text>
                            </View>
                          )}
                        </View>
                      )}
                      
                      {passwordErrors.new && (
                        <Text style={styles.passwordErrorText}>{passwordErrors.new}</Text>
                      )}
                    </View>

                    {/* Confirm Password */}
                    <View style={styles.passwordInputContainer}>
                      <Text style={styles.passwordLabel}>
                        {t("confirm_password") || "Confirm Password"}
                      </Text>
                      <View style={styles.passwordInputWrapper}>
                        <TextInput
                          style={[styles.passwordInput, passwordErrors.confirm && styles.inputError]}
                          value={confirmPassword}
                          onChangeText={(text) => {
                            setConfirmPassword(text);
                            if (text !== newPassword) {
                              setPasswordErrors({
                                ...passwordErrors,
                                confirm: t("passwords_do_not_match") || "Passwords do not match",
                              });
                            } else {
                              setPasswordErrors({ ...passwordErrors, confirm: undefined });
                            }
                          }}
                          placeholder={t("confirm_new_password") || "Confirm new password"}
                          secureTextEntry={!showConfirmPassword}
                          placeholderTextColor="#999"
                        />
                        <TouchableOpacity
                          style={styles.eyeIcon}
                          onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                        >
                          <Ionicons
                            name={showConfirmPassword ? "eye-off" : "eye"}
                            size={20}
                            color="#666"
                          />
                        </TouchableOpacity>
                      </View>
                      {passwordErrors.confirm && (
                        <Text style={styles.errorText}>{passwordErrors.confirm}</Text>
                      )}
                    </View>

                    {/* Action Buttons */}
                    <View style={styles.passwordChangeActions}>
                      <TouchableOpacity
                        style={styles.cancelPasswordButton}
                        onPress={() => {
                          setShowPasswordChange(false);
                          setCurrentPassword("");
                          setNewPassword("");
                          setConfirmPassword("");
                          setPasswordErrors({});
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.cancelPasswordButtonText}>
                          {t("cancel") || "Cancel"}
                        </Text>
                      </TouchableOpacity>
                      
                      <TouchableOpacity
                        style={[styles.savePasswordButton, changingPassword && styles.buttonDisabled]}
                        onPress={handleChangePassword}
                        activeOpacity={0.7}
                        disabled={changingPassword}
                      >
                        {changingPassword ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={styles.savePasswordButtonText}>
                            {t("save") || "Save"}
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            </Accordion>

            {/* Logout Button */}
            <TouchableOpacity
              style={styles.logoutButton}
              onPress={handleLogout}
              activeOpacity={0.7}
            >
              <Ionicons name="log-out-outline" size={22} color="#dc3545" />
              <Text style={styles.logoutButtonText}>
                {t("logout") || "Logout"}
              </Text>
            </TouchableOpacity>
          </View>
          </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 16,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#333",
    flex: 1,
    textAlign: "center",
  },
  headerSpacer: {
    width: 40,
  },
  scrollView: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  scrollContent: {
    paddingBottom: 120, // Space for bottom tab bar and logout button
    backgroundColor: "#ffffff",
  },
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 20,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  profileInfo: {
    flex: 1,
    marginLeft: 16,
  },
  sectionsContainer: {
    backgroundColor: "#ffffff",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#ffffff",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: DARK_TEAL,
    fontWeight: "600",
  },
  errorText: {
    fontSize: 14,
    color: "#dc3545",
    marginTop: 4,
    fontWeight: "500",
  },
  passwordErrorText: {
    fontSize: 12,
    color: "#dc3545",
    marginTop: 4,
    fontWeight: "500",
  },
  passwordRequirements: {
    marginTop: 8,
    marginBottom: 8,
    paddingLeft: 4,
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
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: MINT,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  userName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
    flex: 1,
  },
  userEmail: {
    fontSize: 14,
    color: "#666",
    flex: 1,
  },
  infoItem: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f5f5f5",
  },
  infoItemHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#666",
    marginLeft: 8,
  },
  infoValue: {
    fontSize: 16,
    color: "#333",
    fontWeight: "500",
    marginTop: 4,
  },
  documentImage: {
    width: "100%",
    height: 200,
    borderRadius: 12,
    marginTop: 8,
    backgroundColor: "#f0f0f0",
  },
  photosContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 8,
    gap: 8,
  },
  photo: {
    width: 100,
    height: 100,
    borderRadius: 12,
    backgroundColor: "#f0f0f0",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 14,
    color: "#999",
    marginTop: 12,
    fontStyle: "italic",
  },
  languageSwitcherWrapper: {
    marginTop: 12,
    width: "100%",
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: "#ffffff",
    marginTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
  },
  logoutButtonText: {
    color: "#dc3545",
    fontSize: 16,
    fontWeight: "500",
    marginLeft: 16,
  },
  changePasswordButton: {
    backgroundColor: "#f0f0f0",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginTop: 8,
    alignItems: "center",
  },
  changePasswordButtonText: {
    color: "#333",
    fontSize: 16,
    fontWeight: "500",
  },
  passwordChangeForm: {
    marginTop: 12,
  },
  passwordInputContainer: {
    marginBottom: 16,
  },
  passwordLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: DARK_TEAL,
    marginBottom: 8,
  },
  passwordInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e9ecef",
    paddingHorizontal: 12,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: "#333",
  },
  inputError: {
    borderColor: "#dc3545",
  },
  eyeIcon: {
    padding: 8,
  },
  passwordChangeActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    gap: 12,
  },
  cancelPasswordButton: {
    flex: 1,
    backgroundColor: "#f0f0f0",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  cancelPasswordButtonText: {
    color: "#666",
    fontSize: 16,
    fontWeight: "600",
  },
  savePasswordButton: {
    flex: 1,
    backgroundColor: DARK_TEAL,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  savePasswordButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  phoneDisplayContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  editPhoneButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#f0f0f0",
  },
  editPhoneButtonText: {
    color: "#666",
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 4,
  },
  phoneChangeForm: {
    marginTop: 8,
  },
});
