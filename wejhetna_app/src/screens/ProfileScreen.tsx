// src/screens/ProfileScreen.tsx

import React, { useEffect, useState, useCallback } from "react";
import { appAlert } from "../utils/appAlert";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image, TextInput } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useNavigation, useRoute, CommonActions } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Ionicons from "react-native-vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import SimpleLanguageSwitcher from "../components/SimpleLanguageSwitcher";
import { RootStackParamList } from "../navigation/types";
import { clearUserSession } from "../utils/sessionLogout";
import {
  getUserProfile,
  getDriverProfile,
  getBusinessOwnerProfile,
  UserProfile,
  DriverProfileInfo,
  BusinessOwnerProfileInfo,
} from "../api/profileApi";
import { loadProfileCache, saveProfileCache } from "../db/offlineProfileCache";
import { API_BASE_URL } from "../../config";
import { Colors, Radius, Shadow, Spacing, Typography } from "../theme";
import { useListBottomPad } from "../theme/safeArea";
import {
  ProfileHeaderCard,
  ProfileSection,
  ProfileDetailRow,
  ProfileShortcutCard,
  ProfileStatTile,
  LogoutConfirmModal,
} from "../components/profile";
import AttachmentPreview from "../components/driver/AttachmentPreview";
import type { StatusTone } from "../components/ui/StatusDot";

// Translated, role-aware label map for the header badge.
const ROLE_LABEL_KEY: Record<UserProfile["role"], string> = {
  REGULAR: "regular_user",
  DRIVER: "driver",
  BUSINESS_OWNER: "business_owner",
  ADMIN: "admin",
};

// Distinct accent per role keeps the family identity readable while breaking
// up the "all blue" feeling on shared profile chrome.
const ROLE_TONE: Record<UserProfile["role"], StatusTone> = {
  REGULAR: "primary",
  DRIVER: "accent",
  BUSINESS_OWNER: "info",
  ADMIN: "warning",
};

type NavType = NativeStackNavigationProp<RootStackParamList>;

export default function ProfileScreen() {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const scrollBottomPad = useListBottomPad(140);
  const isRTL = i18n.dir() === "rtl";
  const navigation = useNavigation<NavType>();
  const route = useRoute();
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [driverInfo, setDriverInfo] = useState<DriverProfileInfo | null>(null);
  const [businessInfo, setBusinessInfo] =
    useState<BusinessOwnerProfileInfo | null>(null);
  const [userId, setUserId] = useState<number | null>(null);
  /** Last successful server profile is mirrored to SQLite; this flag drives the offline/cached banner. */
  const [showingCachedProfile, setShowingCachedProfile] = useState(false);
  
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

  // Logout confirmation modal (replaces the old plain appAlert dialog).
  const [logoutVisible, setLogoutVisible] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const loadProfile = useCallback(async () => {
    const params = route.params as { userId?: number };
    let resolvedUserId: number | null = null;
    try {
      setLoading(true);
      setShowingCachedProfile(false);

      if (params?.userId) {
        resolvedUserId = params.userId;
      } else {
        const storedUserId = await AsyncStorage.getItem("userId");
        if (storedUserId) {
          resolvedUserId = parseInt(storedUserId, 10);
        }
      }

      if (!resolvedUserId) {
        appAlert(
          t("error") || "Error",
          t("error_loading_profile") || "Could not load profile"
        );
        return;
      }

      setUserId(resolvedUserId);

      const profile = await getUserProfile(resolvedUserId);
      setUserProfile(profile);

      let driverForCache: DriverProfileInfo | null = null;
      let businessForCache: BusinessOwnerProfileInfo | null = null;

      if (profile.role === "DRIVER") {
        try {
          const driverData = await getDriverProfile(resolvedUserId);
          setDriverInfo(driverData);
          driverForCache = driverData;
        } catch (err) {
          console.log("Could not load driver info:", err);
          setDriverInfo(null);
        }
      } else if (profile.role === "BUSINESS_OWNER") {
        try {
          const businessData = await getBusinessOwnerProfile(resolvedUserId);
          setBusinessInfo(businessData);
          businessForCache = businessData;
        } catch (err) {
          console.log("Could not load business info:", err);
          setBusinessInfo(null);
        }
      } else {
        setDriverInfo(null);
        setBusinessInfo(null);
      }

      saveProfileCache(resolvedUserId, {
        user: profile,
        driver: profile.role === "DRIVER" ? driverForCache : null,
        business: profile.role === "BUSINESS_OWNER" ? businessForCache : null,
      });
    } catch (error: unknown) {
      console.error("Error loading profile:", error);
      if (resolvedUserId != null) {
        const cached = loadProfileCache(resolvedUserId);
        if (cached) {
          setUserId(cached.user.id);
          setUserProfile(cached.user);
          setDriverInfo(cached.driver ?? null);
          setBusinessInfo(cached.business ?? null);
          setShowingCachedProfile(true);
          return;
        }
      }
      appAlert(
        t("error") || "Error",
        t("error_loading_profile") || "Failed to load profile"
      );
    } finally {
      setLoading(false);
    }
  }, [route.params, t]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);
  
  // Open the polished confirmation modal — the actual sign-out side effects
  // (storage clear, navigation reset) run from `confirmLogout` below.
  const handleLogout = () => {
    setLogoutVisible(true);
  };

  const confirmLogout = async () => {
    if (loggingOut) return;
    try {
      setLoggingOut(true);
      await clearUserSession();
    } finally {
      const rootNavigation =
        navigation.getParent()?.getParent() ||
        navigation.getParent() ||
        navigation;
      rootNavigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: "Home" as never }],
        })
      );
      setLoggingOut(false);
      setLogoutVisible(false);
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
      
      appAlert(
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
      appAlert(t("error") || "Error", t("error_loading_profile") || "User ID not found");
      return;
    }

    try {
      setChangingPhone(true);

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
      
      appAlert(
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
      appAlert(t("error") || "Error", t("error_loading_profile") || "User ID not found");
      return;
    }

    try {
      setChangingPassword(true);

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
        
        appAlert(t("error") || "Error", errorMsg);
        return;
      }

      // Success
      appAlert(
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
      appAlert(
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
        <ActivityIndicator size="large" color={Colors.primary} />
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

  // Hide the back button when this screen is rendered as a tab.
  const isInTabNavigator = navigation.getParent()?.getState()?.type === "tab";

  // ----- View-model derived from the existing profile data -----
  const role = userProfile.role;
  const roleLabel = t(ROLE_LABEL_KEY[role]) || role;
  const roleTone = ROLE_TONE[role];

  const formatJoinedDate = (iso?: string): string | null => {
    if (!iso) return null;
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return null;
      return d.toLocaleDateString(i18n.language || undefined, {
        month: "long",
        year: "numeric",
      });
    } catch {
      return null;
    }
  };

  const memberSinceText = formatJoinedDate(userProfile.created_at);
  const memberSinceLine = memberSinceText
    ? `${t("member_since") || "Member since"} ${memberSinceText}`
    : undefined;

  const supportingLine: string | undefined = (() => {
    if (role === "DRIVER" && driverInfo?.vehicle?.car_type) {
      return [driverInfo.vehicle.car_type, driverInfo.vehicle.plate_number]
        .filter(Boolean)
        .join(" · ");
    }
    if (role === "BUSINESS_OWNER" && businessInfo?.place?.name) {
      return businessInfo.place.name;
    }
    return userProfile.email;
  })();

  const titleCase = (raw?: string | null) =>
    raw && raw.length > 0
      ? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase()
      : "—";

  const accountStatusLabel = titleCase(userProfile.status);

  const currentLanguageLabel =
    i18n.language === "ar"
      ? "العربية"
      : i18n.language === "he"
        ? "עברית"
        : (i18n.language || "—");

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      {/* Top toolbar — paddingTop follows notch/status; avoid hardcoded 50 */}
      <View style={[styles.toolbar, { paddingTop: Math.max(insets.top, 12) }]}>
        {!isInTabNavigator ? (
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            activeOpacity={0.85}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={isRTL ? "chevron-forward" : "chevron-back"}
              size={22}
              color={Colors.text}
            />
          </TouchableOpacity>
        ) : (
          <View style={styles.toolbarSlot} />
        )}
        <Text style={styles.toolbarTitle}>{t("profile") || "Profile"}</Text>
        <View style={styles.toolbarSlot} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: scrollBottomPad }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.contentInner}>
          {showingCachedProfile ? (
            <View style={styles.cachedProfileBanner}>
              <Ionicons name="archive-outline" size={18} color={Colors.warning} style={{ marginRight: 10 }} />
              <Text style={styles.cachedProfileBannerText}>{t("profile_cached_banner")}</Text>
            </View>
          ) : null}
          {/* Profile header card (shared across all 4 roles) */}
          <ProfileHeaderCard
            name={userProfile.full_name}
            handle={`@${userProfile.username}`}
            roleLabel={roleLabel}
            roleTone={roleTone}
            eyebrow={t("account_overview") || "Account · Profile"}
            supportingLine={supportingLine}
            secondaryLine={memberSinceLine}
          />

          {/* Quick info / stats row */}
          <View style={styles.statRow}>
            <ProfileStatTile
              label={t("status") || "Status"}
              value={accountStatusLabel}
              tone="success"
              icon="checkmark-circle-outline"
            />
            <ProfileStatTile
              label={t("language") || "Language"}
              value={currentLanguageLabel}
              tone="primary"
              icon="globe-outline"
            />
            {role === "DRIVER" && driverInfo?.driver_status ? (
              <ProfileStatTile
                label={t("driver") || "Driver"}
                value={titleCase(driverInfo.driver_status)}
                tone="accent"
                icon="car-sport-outline"
              />
            ) : null}
            {role === "BUSINESS_OWNER" &&
            (businessInfo?.request_status || businessInfo?.place?.city_name) ? (
              <ProfileStatTile
                label={
                  businessInfo?.request_status
                    ? t("status") || "Status"
                    : t("city") || "City"
                }
                value={
                  businessInfo?.request_status
                    ? titleCase(businessInfo.request_status)
                    : businessInfo?.place?.city_name || "—"
                }
                tone="info"
                icon="business-outline"
              />
            ) : null}
          </View>

          {/* Personal information section */}
          <ProfileSection
            title={t("personal_information") || "Personal Information"}
            icon="person-outline"
            defaultOpen
          >
            <ProfileDetailRow
              label={t("full_name") || "Full Name"}
              value={userProfile.full_name}
              icon="person-outline"
            />
            <ProfileDetailRow
              label={t("username") || "Username"}
              value={userProfile.username}
              icon="at-outline"
            />
            <ProfileDetailRow
              label={t("email") || "Email"}
              value={userProfile.email}
              icon="mail-outline"
              multiline
            />

            {role === "REGULAR" || role === "DRIVER" || role === "BUSINESS_OWNER" ? (
              <ProfileDetailRow
                label={t("phone") || "Phone"}
                value={!showPhoneChange ? userProfile.phone : undefined}
                icon="call-outline"
                trailing={
                  !showPhoneChange ? (
                    <TouchableOpacity
                      style={styles.editPill}
                      onPress={() => {
                        setShowPhoneChange(true);
                        setNewPhone(userProfile.phone);
                        setPhoneError(undefined);
                      }}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="create-outline" size={14} color={Colors.primary} />
                      <Text style={styles.editPillText}>
                        {t("edit") || "Edit"}
                      </Text>
                    </TouchableOpacity>
                  ) : null
                }
              >
                {showPhoneChange ? (
                  <View style={styles.inlineForm}>
                    <View style={[styles.input, phoneError && styles.inputError]}>
                      <TextInput
                        style={styles.inputField}
                        value={newPhone}
                        onChangeText={(text) => {
                          setNewPhone(text);
                          if (phoneError) setPhoneError(undefined);
                        }}
                        placeholder={t("enter_new_phone") || "Enter new phone number"}
                        keyboardType="phone-pad"
                        placeholderTextColor={Colors.textMuted}
                      />
                    </View>
                    {phoneError ? (
                      <Text style={styles.errorText}>{phoneError}</Text>
                    ) : null}
                    <View style={styles.formActions}>
                      <TouchableOpacity
                        style={styles.secondaryBtn}
                        onPress={() => {
                          setShowPhoneChange(false);
                          setNewPhone("");
                          setPhoneError(undefined);
                        }}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.secondaryBtnText}>
                          {t("cancel") || "Cancel"}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.primaryBtn, changingPhone && styles.btnDisabled]}
                        onPress={handleChangePhone}
                        activeOpacity={0.85}
                        disabled={changingPhone}
                      >
                        {changingPhone ? (
                          <ActivityIndicator size="small" color={Colors.textInverse} />
                        ) : (
                          <Text style={styles.primaryBtnText}>
                            {t("save") || "Save"}
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : null}
              </ProfileDetailRow>
            ) : (
              <ProfileDetailRow
                label={t("phone") || "Phone"}
                value={userProfile.phone}
                icon="call-outline"
              />
            )}
          </ProfileSection>

          {role === "DRIVER" ? (
            <ProfileSection
              title={t("vehicle_information") || "Vehicle Information"}
              icon="car-sport-outline"
            >
              {driverInfo?.vehicle ? (
                <>
                  <ProfileDetailRow
                    label={t("car_type") || "Car Type"}
                    value={driverInfo.vehicle.car_type}
                    icon="car-outline"
                  />
                  <ProfileDetailRow
                    label={t("plate_number") || "Plate Number"}
                    value={driverInfo.vehicle.plate_number}
                    icon="document-text-outline"
                  />
                  <ProfileDetailRow
                    label={t("production_year") || "Production Year"}
                    value={String(driverInfo.vehicle.production_year)}
                    icon="calendar-outline"
                  />
                  {driverInfo.vehicle.car_license_image_url ? (
                    <ProfileDetailRow
                      label={t("car_license") || "Car License"}
                      icon="document-outline"
                    >
                      <AttachmentPreview
                        url={driverInfo.vehicle.car_license_image_url}
                        imageStyle={styles.documentImage}
                      />
                    </ProfileDetailRow>
                  ) : null}
                  {driverInfo.vehicle.car_insurance_image_url ? (
                    <ProfileDetailRow
                      label={t("car_insurance") || "Car Insurance"}
                      icon="shield-checkmark-outline"
                    >
                      <AttachmentPreview
                        url={driverInfo.vehicle.car_insurance_image_url}
                        imageStyle={styles.documentImage}
                      />
                    </ProfileDetailRow>
                  ) : null}
                  {driverInfo.vehicle.car_photos_urls &&
                  driverInfo.vehicle.car_photos_urls.length > 0 ? (
                    <ProfileDetailRow
                      label={t("car_photos") || "Car Photos"}
                      icon="images-outline"
                    >
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
                    </ProfileDetailRow>
                  ) : null}
                </>
              ) : (
                <View style={styles.emptyState}>
                  <Ionicons name="car-outline" size={36} color={Colors.textMuted} />
                  <Text style={styles.emptyStateText}>
                    {t("no_vehicle_info") || "No vehicle information available"}
                  </Text>
                </View>
              )}
            </ProfileSection>
          ) : null}

          {role === "DRIVER" && userProfile?.status === "ACTIVE" ? (
            <ProfileSection
              title={t("vehicle_requests_section") || "בקשות רכב"}
              icon="document-text-outline"
              defaultOpen
            >
              {driverInfo?.vehicle_update_blocked ? (
                <Text style={styles.blockedHint}>
                  {t("driver_vehicle_blocked_profile_hint") ||
                    "אינך יכול לבצע נסיעות עד אישור בקשת רכב חדשה."}
                </Text>
              ) : null}
              <ProfileShortcutCard
                icon="create-outline"
                tone="primary"
                title={t("submit_vehicle_update_request") || "שליחת בקשה לעדכון/הוספת רכב"}
                isRTL={isRTL}
                onPress={() => navigation.navigate("DriverVehicleUpdateRequest")}
              />
              <ProfileShortcutCard
                icon="list-outline"
                tone="info"
                title={t("my_requests") || "הבקשות שלי"}
                isRTL={isRTL}
                onPress={() => navigation.navigate("DriverVehicleRequestsList")}
              />
            </ProfileSection>
          ) : null}

          {role === "BUSINESS_OWNER" ? (
            <ProfileSection
              title={t("business_information") || "Business Information"}
              icon="business-outline"
            >
              {businessInfo?.place ? (
                <>
                  <ProfileDetailRow
                    label={t("business_name") || "Business Name"}
                    value={businessInfo.place.name}
                    icon="business-outline"
                  />
                  {businessInfo.place.city_name ? (
                    <ProfileDetailRow
                      label={t("city") || "City"}
                      value={businessInfo.place.city_name}
                      icon="location-outline"
                    />
                  ) : null}
                  {businessInfo.place.category_name ? (
                    <ProfileDetailRow
                      label={t("category") || "Category"}
                      value={businessInfo.place.category_name}
                      icon="grid-outline"
                    />
                  ) : null}
                  {businessInfo.place.description ? (
                    <ProfileDetailRow
                      label={t("description") || "Description"}
                      value={businessInfo.place.description}
                      icon="document-text-outline"
                      multiline
                    />
                  ) : null}
                  {businessInfo.place.phone !== undefined ? (
                    <ProfileDetailRow
                      label={t("phone") || "Phone"}
                      value={
                        !showBusinessPhoneChange
                          ? businessInfo.place.phone || (t("no_phone") || "No phone")
                          : undefined
                      }
                      icon="call-outline"
                      trailing={
                        !showBusinessPhoneChange ? (
                          <TouchableOpacity
                            style={styles.editPill}
                            onPress={() => {
                              setShowBusinessPhoneChange(true);
                              setNewBusinessPhone(businessInfo.place?.phone || "");
                              setBusinessPhoneError(undefined);
                            }}
                            activeOpacity={0.85}
                          >
                            <Ionicons name="create-outline" size={14} color={Colors.primary} />
                            <Text style={styles.editPillText}>
                              {t("edit") || "Edit"}
                            </Text>
                          </TouchableOpacity>
                        ) : null
                      }
                    >
                      {showBusinessPhoneChange ? (
                        <View style={styles.inlineForm}>
                          <View style={[styles.input, businessPhoneError && styles.inputError]}>
                            <TextInput
                              style={styles.inputField}
                              value={newBusinessPhone}
                              onChangeText={(text) => {
                                setNewBusinessPhone(text);
                                if (businessPhoneError) setBusinessPhoneError(undefined);
                              }}
                              placeholder={t("enter_new_phone") || "Enter new phone number"}
                              keyboardType="phone-pad"
                              placeholderTextColor={Colors.textMuted}
                            />
                          </View>
                          {businessPhoneError ? (
                            <Text style={styles.errorText}>{businessPhoneError}</Text>
                          ) : null}
                          <View style={styles.formActions}>
                            <TouchableOpacity
                              style={styles.secondaryBtn}
                              onPress={() => {
                                setShowBusinessPhoneChange(false);
                                setNewBusinessPhone("");
                                setBusinessPhoneError(undefined);
                              }}
                              activeOpacity={0.85}
                            >
                              <Text style={styles.secondaryBtnText}>
                                {t("cancel") || "Cancel"}
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.primaryBtn, changingBusinessPhone && styles.btnDisabled]}
                              onPress={handleChangeBusinessPhone}
                              activeOpacity={0.85}
                              disabled={changingBusinessPhone}
                            >
                              {changingBusinessPhone ? (
                                <ActivityIndicator size="small" color={Colors.textInverse} />
                              ) : (
                                <Text style={styles.primaryBtnText}>
                                  {t("save") || "Save"}
                                </Text>
                              )}
                            </TouchableOpacity>
                          </View>
                        </View>
                      ) : null}
                    </ProfileDetailRow>
                  ) : null}
                  {businessInfo.place.opening_hours ? (
                    <ProfileDetailRow
                      label={t("opening_hours") || "Opening Hours"}
                      value={businessInfo.place.opening_hours}
                      icon="time-outline"
                      multiline
                    />
                  ) : null}
                  {businessInfo.place.lat && businessInfo.place.lon ? (
                    <ProfileDetailRow
                      label={t("location") || "Location"}
                      value={`${businessInfo.place.lat.toFixed(6)}, ${businessInfo.place.lon.toFixed(6)}`}
                      icon="map-outline"
                    />
                  ) : null}
                </>
              ) : (
                <View style={styles.emptyState}>
                  <Ionicons name="business-outline" size={36} color={Colors.textMuted} />
                  <Text style={styles.emptyStateText}>
                    {t("no_business_info") || "No business information available"}
                  </Text>
                </View>
              )}
            </ProfileSection>
          ) : null}

          {role === "ADMIN" && userId ? (
            <ProfileSection
              title={t("admin_actions") || "Admin Actions"}
              icon="construct-outline"
              defaultOpen
            >
              <ProfileShortcutCard
                icon="location-outline"
                tone="warning"
                title={t("add_place") || "Add Place"}
                isRTL={isRTL}
                onPress={() =>
                  navigation.navigate("AdminPlaceMapPicker", {
                    initialLat: 31.24,
                    initialLon: 34.83,
                    adminUserId: userId,
                    role: "ADMIN",
                  })
                }
              />
              <ProfileShortcutCard
                icon="grid-outline"
                tone="info"
                title={t("add_category") || "Add Category"}
                isRTL={isRTL}
                onPress={() =>
                  navigation.navigate("AdminCategories", {
                    adminUserId: userId,
                    role: "ADMIN",
                  })
                }
              />
              <ProfileShortcutCard
                icon="business-outline"
                tone="primary"
                title={t("add_city") || "Add City"}
                isRTL={isRTL}
                onPress={() =>
                  navigation.navigate("AdminCities", {
                    adminUserId: userId,
                    role: "ADMIN",
                  })
                }
              />
            </ProfileSection>
          ) : null}

          {userId &&
          (role === "REGULAR" ||
            role === "DRIVER" ||
            role === "BUSINESS_OWNER") ? (
            <View style={styles.shortcutGroup}>
              <Text style={[styles.groupHeading, isRTL && styles.rtlText]}>
                {t("advertisements.profileSection")}
              </Text>
              <ProfileShortcutCard
                icon="megaphone-outline"
                tone="accent"
                variant="prominent"
                title={t("advertisements.requestAdvertisement")}
                subtitle={t("advertisements.requestAdvertisementSubtitle")}
                isRTL={isRTL}
                onPress={() => navigation.navigate("CreateAdvertisement")}
              />
              <ProfileShortcutCard
                icon="albums-outline"
                tone="primary"
                title={t("advertisements.myAds.title")}
                subtitle={t("advertisements.myAds.subtitle")}
                isRTL={isRTL}
                onPress={() =>
                  navigation.navigate("MyAdvertisements", { userId })
                }
              />
            </View>
          ) : null}

          <ProfileSection
            title={t("saved_places") || "Saved places"}
            icon="bookmark-outline"
          >
            <ProfileShortcutCard
              icon="bookmark-outline"
              tone="primary"
              title={t("view_saved_places") || "View saved places"}
              isRTL={isRTL}
              onPress={() => {
                if (userId) {
                  navigation.navigate("SavedPlaces");
                } else {
                  appAlert(
                    t("error") || "Error",
                    t("error_loading_profile") || "Could not load profile"
                  );
                }
              }}
            />
          </ProfileSection>

          <ProfileSection
            title={t("account_settings") || "Account Settings"}
            icon="settings-outline"
          >
            <View style={styles.settingsBlock}>
              <Text style={styles.settingsLabel}>
                {t("change_language") || "Change language"}
              </Text>
              <View style={styles.languageSwitcherWrap}>
                <SimpleLanguageSwitcher />
              </View>
            </View>

            <View style={styles.settingsBlock}>
              <Text style={styles.settingsLabel}>
                {t("change_password") || "Change password"}
              </Text>

              {!showPasswordChange ? (
                <ProfileShortcutCard
                  icon="lock-closed-outline"
                  tone="primary"
                  title={t("change_password") || "Change password"}
                  isRTL={isRTL}
                  onPress={() => setShowPasswordChange(true)}
                />
              ) : (
                <View style={styles.inlineForm}>
                  <Text style={styles.fieldLabel}>
                    {t("current_password") || "Current Password"}
                  </Text>
                  <View style={[styles.input, passwordErrors.current && styles.inputError]}>
                    <TextInput
                      style={styles.inputField}
                      value={currentPassword}
                      onChangeText={(text) => {
                        setCurrentPassword(text);
                        if (passwordErrors.current) {
                          setPasswordErrors({ ...passwordErrors, current: undefined });
                        }
                      }}
                      placeholder={t("enter_current_password") || "Enter current password"}
                      secureTextEntry={!showCurrentPassword}
                      placeholderTextColor={Colors.textMuted}
                    />
                    <TouchableOpacity
                      style={styles.eyeBtn}
                      onPress={() => setShowCurrentPassword(!showCurrentPassword)}
                    >
                      <Ionicons
                        name={showCurrentPassword ? "eye-off" : "eye"}
                        size={18}
                        color={Colors.textSecondary}
                      />
                    </TouchableOpacity>
                  </View>
                  {passwordErrors.current ? (
                    <Text style={styles.errorText}>{passwordErrors.current}</Text>
                  ) : null}

                  <Text style={[styles.fieldLabel, styles.fieldLabelGap]}>
                    {t("new_password") || "New Password"}
                  </Text>
                  <View style={[styles.input, passwordErrors.new && styles.inputError]}>
                    <TextInput
                      style={styles.inputField}
                      value={newPassword}
                      onChangeText={(text) => {
                        setNewPassword(text);
                        if (passwordErrors.new) {
                          setPasswordErrors({ ...passwordErrors, new: undefined });
                        }
                        if (text === confirmPassword && passwordErrors.confirm) {
                          setPasswordErrors({ ...passwordErrors, confirm: undefined });
                        }
                      }}
                      placeholder={t("enter_new_password") || "Enter new password"}
                      secureTextEntry={!showNewPassword}
                      placeholderTextColor={Colors.textMuted}
                    />
                    <TouchableOpacity
                      style={styles.eyeBtn}
                      onPress={() => setShowNewPassword(!showNewPassword)}
                    >
                      <Ionicons
                        name={showNewPassword ? "eye-off" : "eye"}
                        size={18}
                        color={Colors.textSecondary}
                      />
                    </TouchableOpacity>
                  </View>

                  {newPassword.length > 0 ? (
                    <View style={styles.requirements}>
                      {!passwordMeetsLength(newPassword) && (
                        <View style={styles.requirementItem}>
                          <Ionicons name="close-circle" size={14} color={Colors.danger} />
                          <Text style={styles.requirementText}>
                            {t("password_req_length") || "At least 8 characters"}
                          </Text>
                        </View>
                      )}
                      {!passwordMeetsUppercase(newPassword) && (
                        <View style={styles.requirementItem}>
                          <Ionicons name="close-circle" size={14} color={Colors.danger} />
                          <Text style={styles.requirementText}>
                            {t("password_req_uppercase") || "Uppercase letter"}
                          </Text>
                        </View>
                      )}
                      {!passwordMeetsLowercase(newPassword) && (
                        <View style={styles.requirementItem}>
                          <Ionicons name="close-circle" size={14} color={Colors.danger} />
                          <Text style={styles.requirementText}>
                            {t("password_req_lowercase") || "Lowercase letter"}
                          </Text>
                        </View>
                      )}
                      {!passwordMeetsNumber(newPassword) && (
                        <View style={styles.requirementItem}>
                          <Ionicons name="close-circle" size={14} color={Colors.danger} />
                          <Text style={styles.requirementText}>
                            {t("password_req_number") || "Number"}
                          </Text>
                        </View>
                      )}
                      {!passwordMeetsSymbol(newPassword) && (
                        <View style={styles.requirementItem}>
                          <Ionicons name="close-circle" size={14} color={Colors.danger} />
                          <Text style={styles.requirementText}>
                            {t("password_req_symbol") || "Symbol"}
                          </Text>
                        </View>
                      )}
                    </View>
                  ) : null}

                  {passwordErrors.new ? (
                    <Text style={styles.errorText}>{passwordErrors.new}</Text>
                  ) : null}

                  <Text style={[styles.fieldLabel, styles.fieldLabelGap]}>
                    {t("confirm_password") || "Confirm Password"}
                  </Text>
                  <View style={[styles.input, passwordErrors.confirm && styles.inputError]}>
                    <TextInput
                      style={styles.inputField}
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
                      placeholderTextColor={Colors.textMuted}
                    />
                    <TouchableOpacity
                      style={styles.eyeBtn}
                      onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                    >
                      <Ionicons
                        name={showConfirmPassword ? "eye-off" : "eye"}
                        size={18}
                        color={Colors.textSecondary}
                      />
                    </TouchableOpacity>
                  </View>
                  {passwordErrors.confirm ? (
                    <Text style={styles.errorText}>{passwordErrors.confirm}</Text>
                  ) : null}

                  <View style={styles.formActions}>
                    <TouchableOpacity
                      style={styles.secondaryBtn}
                      onPress={() => {
                        setShowPasswordChange(false);
                        setCurrentPassword("");
                        setNewPassword("");
                        setConfirmPassword("");
                        setPasswordErrors({});
                      }}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.secondaryBtnText}>
                        {t("cancel") || "Cancel"}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.primaryBtn, changingPassword && styles.btnDisabled]}
                      onPress={handleChangePassword}
                      activeOpacity={0.85}
                      disabled={changingPassword}
                    >
                      {changingPassword ? (
                        <ActivityIndicator size="small" color={Colors.textInverse} />
                      ) : (
                        <Text style={styles.primaryBtnText}>
                          {t("save") || "Save"}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          </ProfileSection>

          <TouchableOpacity
            style={styles.logoutCard}
            onPress={handleLogout}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t("logout") || "Logout"}
          >
            <View style={styles.logoutIconWrap}>
              <Ionicons
                name="log-out-outline"
                size={20}
                color={Colors.danger}
              />
            </View>
            <Text style={[styles.logoutText, isRTL && styles.rtlText]}>
              {t("logout") || "Logout"}
            </Text>
            <Ionicons
              name={isRTL ? "chevron-back" : "chevron-forward"}
              size={20}
              color={Colors.textMuted}
            />
          </TouchableOpacity>
        </View>
      </ScrollView>

      <LogoutConfirmModal
        visible={logoutVisible}
        loading={loggingOut}
        onCancel={() => {
          if (!loggingOut) setLogoutVisible(false);
        }}
        onConfirm={confirmLogout}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.bg,
    paddingHorizontal: Spacing.xl,
  },
  loadingText: {
    marginTop: Spacing.md,
    fontSize: Typography.sizeBase,
    color: Colors.textSecondary,
    fontWeight: Typography.weightSemibold,
  },

  // Top toolbar -------------------------------------------------------------
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    backgroundColor: Colors.bg,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.soft,
  },
  toolbarSlot: {
    width: 40,
  },
  toolbarTitle: {
    flex: 1,
    fontSize: Typography.sizeXl,
    fontWeight: Typography.weightHeavy,
    color: Colors.text,
    textAlign: "center",
    letterSpacing: -0.2,
  },

  // Scroll body ------------------------------------------------------------
  scrollView: {
    flex: 1,
  },
  scrollContent: {},
  contentInner: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    gap: Spacing.lg,
  },
  cachedProfileBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.warningSoft,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.accentSoft,
  },
  cachedProfileBannerText: {
    flex: 1,
    fontSize: Typography.sizeSm,
    color: Colors.warning,
    lineHeight: 20,
    fontWeight: Typography.weightSemibold,
  },

  // Stats / shortcut groups -----------------------------------------------
  statRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  shortcutGroup: {
    gap: Spacing.md,
  },
  groupHeading: {
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: Colors.textMuted,
    fontWeight: Typography.weightBold,
    paddingHorizontal: Spacing.xs,
  },
  rtlText: {
    textAlign: "right",
    writingDirection: "rtl",
  },

  // Inline forms (phone change, password change) --------------------------
  inlineForm: {
    gap: Spacing.sm,
  },
  fieldLabel: {
    fontSize: Typography.sizeSm,
    fontWeight: Typography.weightSemibold,
    color: Colors.textSecondary,
  },
  fieldLabelGap: {
    marginTop: Spacing.md,
  },
  input: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
  },
  inputField: {
    flex: 1,
    paddingVertical: Spacing.md - 2,
    fontSize: Typography.sizeBase + 1,
    color: Colors.text,
  },
  inputError: {
    borderColor: Colors.danger,
  },
  eyeBtn: {
    padding: Spacing.xs + 2,
  },
  formActions: {
    flexDirection: "row",
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  primaryBtn: {
    flex: 1,
    height: 44,
    borderRadius: Radius.lg,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    ...Shadow.soft,
  },
  primaryBtnText: {
    color: Colors.textInverse,
    fontSize: Typography.sizeBase,
    fontWeight: Typography.weightBold,
  },
  secondaryBtn: {
    flex: 1,
    height: 44,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceMuted,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: {
    color: Colors.text,
    fontSize: Typography.sizeBase,
    fontWeight: Typography.weightBold,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  errorText: {
    fontSize: Typography.sizeSm,
    color: Colors.danger,
    fontWeight: Typography.weightMedium,
  },
  requirements: {
    marginTop: 4,
    paddingLeft: 2,
    gap: 4,
  },
  requirementItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  requirementText: {
    fontSize: Typography.sizeSm,
    color: Colors.danger,
  },
  editPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    backgroundColor: Colors.primarySoft,
  },
  editPillText: {
    color: Colors.primary,
    fontSize: Typography.sizeSm,
    fontWeight: Typography.weightBold,
  },

  // Settings block --------------------------------------------------------
  settingsBlock: {
    gap: Spacing.sm,
    paddingTop: Spacing.xs,
  },
  settingsLabel: {
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: Colors.textMuted,
    fontWeight: Typography.weightBold,
  },
  languageSwitcherWrap: {
    width: "100%",
  },

  // Vehicle / business assets ---------------------------------------------
  documentImage: {
    width: "100%",
    height: 200,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceMuted,
  },
  photosContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  photo: {
    width: 100,
    height: 100,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceMuted,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.xxl,
    gap: Spacing.sm,
  },
  blockedHint: {
    color: Colors.error,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: Spacing.sm,
    lineHeight: 20,
  },
  emptyStateText: {
    fontSize: Typography.sizeSm,
    color: Colors.textMuted,
    fontStyle: "italic",
  },

  // Logout card -----------------------------------------------------------
  logoutCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    paddingVertical: Spacing.md + 2,
    paddingHorizontal: Spacing.md + 2,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.soft,
  },
  logoutIconWrap: {
    width: 38,
    height: 38,
    borderRadius: Radius.lg,
    backgroundColor: Colors.dangerSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  logoutText: {
    flex: 1,
    color: Colors.danger,
    fontSize: Typography.sizeMd,
    fontWeight: Typography.weightBold,
  },
});
