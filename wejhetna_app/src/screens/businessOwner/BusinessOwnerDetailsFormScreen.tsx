// src/screens/businessOwner/BusinessOwnerDetailsFormScreen.tsx

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  ScrollView,
  Image,
} from "react-native";
import { useTranslation } from "react-i18next";
import { launchImageLibrary } from "react-native-image-picker";
import { useRoute, useNavigation, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Picker } from "@react-native-picker/picker";
import Ionicons from "react-native-vector-icons/Ionicons";
import { RootStackParamList } from "../../navigation/types";
import {
  fetchCities,
  fetchCategories,
  City,
  Category,
} from "../../api/places";
import {
  createBusinessOwnerPlaceRequest,
  BusinessOwnerPlaceRequestPayload,
} from "../../api/businessOwnerApi";
import MessageModal from "../MessageModal";
import { uploadAssetToS3Presigned } from "../../api/upload";

const DARK_TEAL = "#0f5b63";
import { API_BASE_URL } from "../../../config";

const SOFT_TEAL = "#3a8d96";
const MINT = "#9bd3d8";
type BusinessOwnerDetailsFormRoute = RouteProp<
  RootStackParamList,
  "BusinessOwnerDetailsForm"
>;

export default function BusinessOwnerDetailsFormScreen() {
  const { t } = useTranslation();
  const route = useRoute<BusinessOwnerDetailsFormRoute>();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const params = route.params;
  const personalInfo = params?.personalInfo;
  const lat = params?.lat ?? 0;
  const lon = params?.lon ?? 0;
  const source = params?.source ?? "MAP_PICK";
  const osmId = params?.osmId ?? null;
  const existingPlaceId = params?.existingPlaceId ?? null;
  const detectedCityId = params?.detectedCityId ?? null;

  const [name, setName] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [nameHe, setNameHe] = useState("");

  const [cityId, setCityId] = useState<number | undefined>(undefined);
  const [categoryId, setCategoryId] = useState<number | undefined>(undefined);

  const [description, setDescription] = useState("");
  const [phone, setPhone] = useState("");
  const [openingHours, _setOpeningHours] = useState(""); // Kept for payload compatibility, UI field removed
  const [socialMediaAccountName, setSocialMediaAccountName] = useState("");

  // Image uploads (UI only - not sent to backend)
  const [businessLicenseUrl, setBusinessLicenseUrl] = useState<string>("");
  const [businessImagesUrls, setBusinessImagesUrls] = useState<string[]>([]);
  const [uploadingLicense, setUploadingLicense] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [cities, setCities] = useState<City[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [phoneTouched, setPhoneTouched] = useState(false);

  // Error states for validation
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameArError, setNameArError] = useState<string | null>(null);
  const [nameHeError, setNameHeError] = useState<string | null>(null);
  const [cityError, setCityError] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  // Modal states
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState<"error" | "success">("error");
  const [modalTitle, setModalTitle] = useState("");
  const [modalMessage, setModalMessage] = useState("");

  const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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
  
  useEffect(() => {
    let isActive = true;

    async function loadData() {
      try {
        setLoading(true);

        const [citiesRes, categoriesRes] = await Promise.all([
          fetchCities(),
          fetchCategories(),
        ]);

        if (!isActive) return;

        setCities(citiesRes);
        setCategories(categoriesRes);

        if (detectedCityId) {
          setCityId(detectedCityId);
        } else if (citiesRes.length > 0) {
          setCityId((prev) => prev ?? citiesRes[0].id);
        }
      } catch (err) {
        console.error(err);
        showModal(
          "error",
          t("error") || "Error",
          t("failed_to_load_data") || "Failed to load cities/categories from server"
        );
      } finally {
        if (isActive) setLoading(false);
      }
    }

    loadData();
    return () => {
      isActive = false;
    };
  }, [t, detectedCityId]);

  function handlePhoneChange(value: string) {
    const digitsOnly = value.replace(/[^0-9]/g, "").slice(0, 10);
    setPhone(digitsOnly);
    if (!phoneTouched) setPhoneTouched(true);
    
    // Validate phone
    if (digitsOnly.length > 0) {
      const isValid = digitsOnly.length === 9 || digitsOnly.length === 10;
      setPhoneError(isValid ? null : (t("phone_must_be_9_or_10_digits") || "Phone must be 9 or 10 digits"));
    } else {
      setPhoneError(null);
    }
  }

  
  function handleNameChange(value: string) {
    const cleaned = value.replace(/[^A-Za-z0-9 _-]/g, "");
    setName(cleaned);
    if (cleaned.trim().length > 0) {
      setNameError(cleaned.trim().length < 2 ? (t("business_name_min_chars") || "Business name must be at least 2 characters") : null);
    } else {
      setNameError(null);
    }
  }
  
  function handleNameArChange(value: string) {
    // Only allow Arabic characters, numbers, spaces, and common Arabic punctuation
    // Arabic Unicode ranges: \u0600-\u06FF (Arabic), \u0750-\u077F (Arabic Supplement), 
    // \u08A0-\u08FF (Arabic Extended-A), \uFB50-\uFDFF (Arabic Presentation Forms-A),
    // \uFE70-\uFEFF (Arabic Presentation Forms-B)
    // Also allow common punctuation: ، ؛ ؟ - _ and numbers
    const arabicRegex = /^[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\s0-9،؛؟\-_]*$/;
    const filtered = value.split('').filter(char => arabicRegex.test(char)).join('');
    setNameAr(filtered);
    if (filtered.trim().length > 0) {
      setNameArError(filtered.trim().length < 2 ? (t("business_name_min_chars") || "Business name must be at least 2 characters") : null);
    } else {
      setNameArError(null);
    }
  }
  
  function handleNameHeChange(value: string) {
    // Only allow Hebrew characters, numbers, spaces, and common Hebrew punctuation
    // Hebrew Unicode range: \u0590-\u05FF
    // Also allow common punctuation: ׳ ״ - _ and numbers
    const hebrewRegex = /^[\u0590-\u05FF\s0-9׳״\-_]*$/;
    const filtered = value.split('').filter(char => hebrewRegex.test(char)).join('');
    setNameHe(filtered);
    if (filtered.trim().length > 0) {
      setNameHeError(filtered.trim().length < 2 ? (t("business_name_min_chars") || "Business name must be at least 2 characters") : null);
    } else {
      setNameHeError(null);
    }
  }
  
  function handleCityChange(value: number | undefined) {
    setCityId(value);
    setCityError(value ? null : (t("please_select_city") || "Please select a city"));
  }
  
  function handleCategoryChange(value: number | undefined) {
    setCategoryId(value);
    setCategoryError(value ? null : (t("please_select_category") || "Please select a category"));
  }

  // Image upload helper (UI only - not sent to backend)
  const pickAndUpload = async (
    setUrl: (url: string) => void,
    setUploading: (loading: boolean) => void
  ) => {
    // Prevent double-taps/races between press and picker callback
    if (uploadingLicense || uploadingImages) {
      console.log("[UPLOAD] blocked: already uploading");
      return;
    }
    setUploadError(null);
    console.log("[UPLOAD] started");
    launchImageLibrary({ 
      mediaType: "photo",
      quality: 0.7,
      maxWidth: 1920,
      maxHeight: 1920,
      includeBase64: true,
    }, async (res) => {
      console.log("[UPLOAD] picker response:", res);
      if (!res) {
        const msg = "Picker returned empty response";
        console.log("[UPLOAD] error state set (picker):", msg);
        setUploadError(msg);
        return;
      }
      if (res.didCancel || res.errorCode) {
        console.log("[UPLOAD] picker cancelled/error:", res.errorCode, res.errorMessage);
        return;
      }

      if (!Array.isArray(res.assets) || res.assets.length === 0) {
        const msg = "Picker returned no assets";
        console.log("[UPLOAD] error state set (picker):", msg);
        setUploadError(msg);
        return;
      }

      const asset = res.assets[0];
      if (!asset || !asset.uri) {
        const msg = "Picker returned no asset URI";
        console.log("[UPLOAD] error state set (picker):", msg);
        setUploadError(msg);
        return;
      }

      setUploading(true);
      try {
        console.log("[UPLOAD] selected asset uri:", asset.uri);
        // Small defer to let the picker/asset URI settle (fixes immediate-select race)
        await wait(0);
        await wait(150);
        let lastError: any = null;
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            console.log("[UPLOAD] presign+put started (attempt):", attempt);
            const fileUrl = await uploadAssetToS3Presigned({
              uri: asset.uri,
              fileName: asset.fileName,
              type: asset.type,
              base64: (asset as any).base64,
            });
            console.log("[UPLOAD] file_url:", fileUrl);
            console.log("[UPLOAD] state updated with file_url");
            setUrl(fileUrl);
            lastError = null;
            break;
          } catch (err: any) {
            lastError = err;
            const msg = err?.message || String(err);
            console.log("[UPLOAD] attempt failed:", attempt, msg);
            // Retry only for the common fast-pick fetch failure
            if (attempt < 2 && /Network request failed/i.test(msg)) {
              await wait(300);
              continue;
            }
            break;
          }
        }

        if (lastError) {
          const msg = lastError?.message || String(lastError);
          console.log("[UPLOAD] error state set (final):", msg);
          setUploadError(msg);
          Alert.alert(
            t("error") || "Error",
            `${t("upload_failed") || "Upload failed"}: ${msg}`
          );
        }
      } catch (e: any) {
        const msg = e?.message || String(e);
        console.log("[UPLOAD] error state set (exception):", msg);
        setUploadError(msg);
        Alert.alert(
          t("error") || "Error",
          `${t("upload_failed") || "Upload failed"}: ${e?.message || (t("unknown_error") || "Unknown error")}`
        );
      } finally {
        setUploading(false);
      }
    });
  };

  const handleUploadBusinessLicense = () => {
    pickAndUpload(setBusinessLicenseUrl, setUploadingLicense);
  };

  const handleUploadBusinessImage = () => {
    if (uploadingImages || uploadingLicense) {
      console.log("[UPLOAD] blocked: already uploading");
      return;
    }
    setUploadError(null);
    console.log("[UPLOAD] started (business image)");
    launchImageLibrary({ 
      mediaType: "photo",
      quality: 0.7,
      maxWidth: 1920,
      maxHeight: 1920,
      includeBase64: true,
    }, async (res) => {
      console.log("[UPLOAD] picker response:", res);
      if (!res) {
        const msg = "Picker returned empty response";
        console.log("[UPLOAD] error state set (picker):", msg);
        setUploadError(msg);
        return;
      }
      if (res.didCancel || res.errorCode) {
        console.log("[UPLOAD] picker cancelled/error:", res.errorCode, res.errorMessage);
        return;
      }

      if (!Array.isArray(res.assets) || res.assets.length === 0) {
        const msg = "Picker returned no assets";
        console.log("[UPLOAD] error state set (picker):", msg);
        setUploadError(msg);
        return;
      }

      const asset = res.assets[0];
      if (!asset || !asset.uri) {
        const msg = "Picker returned no asset URI";
        console.log("[UPLOAD] error state set (picker):", msg);
        setUploadError(msg);
        return;
      }

      setUploadingImages(true);
      try {
        console.log("[UPLOAD] selected asset uri:", asset.uri);
        // Small defer to let the picker/asset URI settle (fixes immediate-select race)
        await wait(0);
        await wait(150);
        let lastError: any = null;
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            console.log("[UPLOAD] presign+put started (attempt):", attempt);
            const fileUrl = await uploadAssetToS3Presigned({
              uri: asset.uri,
              fileName: asset.fileName,
              type: asset.type,
              base64: (asset as any).base64,
            });
            console.log("[UPLOAD] file_url:", fileUrl);
            console.log("[UPLOAD] state updated with file_url");
            setBusinessImagesUrls((prev) => [...prev, fileUrl]);
            lastError = null;
            break;
          } catch (err: any) {
            lastError = err;
            const msg = err?.message || String(err);
            console.log("[UPLOAD] attempt failed:", attempt, msg);
            if (attempt < 2 && /Network request failed/i.test(msg)) {
              await wait(300);
              continue;
            }
            break;
          }
        }

        if (lastError) {
          const msg = lastError?.message || String(lastError);
          console.log("[UPLOAD] error state set (final):", msg);
          setUploadError(msg);
          Alert.alert(
            t("error") || "Error",
            `${t("upload_failed") || "Upload failed"}: ${msg}`
          );
        }
      } catch (e: any) {
        const msg = e?.message || String(e);
        console.log("[UPLOAD] error state set (exception):", msg);
        setUploadError(msg);
        Alert.alert(
          t("error") || "Error",
          `${t("upload_failed") || "Upload failed"}: ${e?.message || (t("unknown_error") || "Unknown error")}`
        );
      } finally {
        setUploadingImages(false);
      }
    });
  };

  const handleRemoveBusinessImage = (index: number) => {
    setBusinessImagesUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const hasPhone = phone.length > 0;
  const isPhoneLengthRuleOk = phone.length === 9 || phone.length === 10;
  const isPhoneValid = !hasPhone || isPhoneLengthRuleOk;

  const isNameValid = name.trim().length > 0;
  const isNameArValid = nameAr.trim().length > 0;
  const isNameHeValid = nameHe.trim().length > 0;
  const isCityValid = !!cityId;
  const isCategoryValid = !!categoryId;

  const isFormValid =
    isNameValid &&
    isNameArValid &&
    isNameHeValid &&
    isCityValid &&
    isCategoryValid &&
    isPhoneValid;

  const canSubmit = isFormValid && !submitting && !uploadingLicense && !uploadingImages;

  async function handleSubmit() {
    if (uploadingLicense || uploadingImages) {
      Alert.alert(t("error") || "Error", t("please_wait_for_upload") || "Please wait for the upload to finish");
      return;
    }
    if (!isNameValid) {
      Alert.alert(t("error") || "Error", t("business_name_english_required") || "Business name (English) is required");
      return;
    }
    if (!isNameArValid) {
      Alert.alert(t("error") || "Error", t("business_name_arabic_required") || "Business name (Arabic) is required");
      return;
    }
    if (!isNameHeValid) {
      Alert.alert(t("error") || "Error", t("business_name_hebrew_required") || "Business name (Hebrew) is required");
      return;
    }

    if (!isCityValid) {
      Alert.alert(t("error") || "Error", t("please_select_city") || "Please select a city");
      return;
    }

    if (!isCategoryValid) {
      Alert.alert(t("error") || "Error", t("please_select_category") || "Please select a category");
      return;
    }

    if (!isPhoneValid) {
      Alert.alert(
        t("error") || "Error",
        t("phone_must_be_9_or_10_digits") || "Phone number (if provided) must be 9 or 10 digits"
      );
      return;
    }

    if (!lat || !lon) {
      Alert.alert(t("error") || "Error", t("location_required") || "Location is required");
      return;
    }

    try {
      setSubmitting(true);

      // Prepare payload - include personal info to create user
      const payload: BusinessOwnerPlaceRequestPayload = {
        // Personal info (will create user in backend)
        full_name: personalInfo?.full_name || "",
        username: personalInfo?.username || "",
        email: personalInfo?.email || "",
        phone: personalInfo?.phone || "", // User's personal phone
        password: personalInfo?.password || "",
        // Business and location info
        existing_place_id: existingPlaceId ?? null,
        lat,
        lon,
        source,
        osm_id: osmId ?? null,
        name: name.trim(),
        name_ar: nameAr.trim(),
        name_he: nameHe.trim(),
        city_id: cityId!,
        category_id: categoryId!,
        description: description.trim() || null,
        business_phone: hasPhone ? phone : null, // Business phone (optional)
        opening_hours: openingHours.trim() || null,
        main_image_url: null,
        business_license_image_url: businessLicenseUrl || null,
        business_images_urls: businessImagesUrls.length > 0 ? businessImagesUrls : null,
        social_links: null,
      };

      // Log payload for debugging
      console.log("Submitting payload:", JSON.stringify(payload, null, 2));

      await createBusinessOwnerPlaceRequest(payload);

      showModal(
        "success",
        t("request_submitted") || "Request Submitted",
        t("business_request_submitted") || "Your business place request has been submitted successfully. An admin will review it and you will be notified once it's approved."
      );
    } catch (err: any) {
      // Log full error details for debugging
      console.log("=== ERROR DETAILS ===");
      console.log("Error object:", err);
      console.log("Error type:", typeof err);
      console.log("Has response:", !!err?.response);
      console.log("Response status:", err?.response?.status);
      console.log("Response data:", err?.response?.data);
      console.log("Error message:", err?.message);
      console.log("Error stack:", err?.stack);
      console.log("===================");
      
      // Extract error message properly
      let errorMessage = "Could not submit place request";
      
      try {
        if (err?.response) {
          const status = err.response.status;
          const errorData = err.response.data;
          
          console.log("Status code:", status);
          console.log("Error data:", errorData);
          
          // Handle different error response formats
          if (typeof errorData?.detail === "string") {
            errorMessage = errorData.detail;
            
            // Handle specific "already exists" errors with better messages
            const errorDetailLower = errorMessage.toLowerCase();
            if (errorDetailLower.includes("username") && errorDetailLower.includes("already exists")) {
              errorMessage = t("username_already_exists") || t("username_taken") || "Username already exists. Please choose a different username.";
            } else if (errorDetailLower.includes("email") && errorDetailLower.includes("already exists")) {
              errorMessage = t("email_already_exists") || "Email already exists. Please use a different email or try logging in.";
            } else if (errorDetailLower.includes("phone") && (errorDetailLower.includes("already exists") || errorDetailLower.includes("already"))) {
              errorMessage = t("phone_already_exists") || t("phone_taken") || "Phone number already exists. Please use a different phone number.";
            } else if (errorDetailLower.includes("username or email") && errorDetailLower.includes("already exists")) {
              errorMessage = t("username_or_email_exists") || "Username or email already exists. Please use different credentials or try logging in.";
            }
          } else if (Array.isArray(errorData?.detail)) {
            // FastAPI validation errors
            const msgs = errorData.detail
              .map((d: any) => {
                const loc = d.loc ? d.loc.join(".") : "";
                const msg = d.msg || "";
                return loc ? `${loc}: ${msg}` : msg;
              })
              .filter(Boolean);
            if (msgs.length > 0) {
              errorMessage = msgs.join("\n");
            }
          } else if (errorData?.detail && typeof errorData.detail === "object") {
            if (errorData.detail.message) {
              errorMessage = errorData.detail.message;
            } else if (errorData.detail.msg) {
              errorMessage = errorData.detail.msg;
            } else {
              errorMessage = "Validation error: " + JSON.stringify(errorData.detail);
            }
          } else if (typeof errorData?.message === "string") {
            errorMessage = errorData.message;
          } else if (typeof errorData?.error === "string") {
            errorMessage = errorData.error;
          } else if (errorData) {
            errorMessage = "Server error: " + JSON.stringify(errorData);
          }
          
          // Add status code info
          if (status === 404) {
            errorMessage = "Not found: " + errorMessage;
          } else if (status === 400) {
            errorMessage = "Invalid request: " + errorMessage;
          } else if (status === 500) {
            errorMessage = "Server error: " + errorMessage;
          }
        } else if (err?.request) {
          errorMessage = "Network error: Could not reach server. Please check your connection.";
        } else if (err?.message && typeof err.message === "string") {
          errorMessage = err.message;
        }
      } catch (parseError) {
        console.log("Error parsing error message:", parseError);
        errorMessage = "Failed to submit request. Please check your connection and try again.";
      }
      
      console.log("Final error message:", errorMessage);
      Alert.alert("Error", errorMessage);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={DARK_TEAL} />
        <Text style={styles.loadingText}>{t("loading_cities_categories") || "Loading cities and categories..."}</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={DARK_TEAL} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("business_details") || "Business Details"}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.container}>
          {existingPlaceId && (
            <View style={styles.infoBanner}>
              <Ionicons name="information-circle" size={20} color={SOFT_TEAL} />
              <Text style={styles.infoBannerText}>
                {t("claiming_existing_place") || "You are claiming an existing place on the map."}
              </Text>
            </View>
          )}

          {/* Business Names Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("business_name") || "Business Name"} *</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t("english") || "English"}</Text>
              <TextInput
                style={[styles.input, styles.inputLTR, nameError && styles.inputError]}
                value={name}
                onChangeText={handleNameChange}
                placeholder={t("example_coffee_shop") || "Example: Coffee Shop"}
                placeholderTextColor="#9ab8bd"
                textAlign="left"
              />
              {nameError && <Text style={styles.fieldError}>{nameError}</Text>}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t("arabic") || "Arabic"}</Text>
              <TextInput
                style={[styles.input, styles.inputRTL, nameArError && styles.inputError]}
                value={nameAr}
                onChangeText={handleNameArChange}
                placeholder={t("example_cafe_ar") || "مثال: مقهى"}
                textAlign="right"
                placeholderTextColor="#9ab8bd"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {nameArError && <Text style={[styles.fieldError, styles.fieldErrorRTL]}>{nameArError}</Text>}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t("hebrew") || "Hebrew"}</Text>
              <TextInput
                style={[styles.input, styles.inputRTL, nameHeError && styles.inputError]}
                value={nameHe}
                onChangeText={handleNameHeChange}
                placeholder={t("example_cafe_he") || "דוגמה: בית קפה"}
                textAlign="right"
                placeholderTextColor="#9ab8bd"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {nameHeError && <Text style={[styles.fieldError, styles.fieldErrorRTL]}>{nameHeError}</Text>}
            </View>
          </View>

          {/* City and Category Section */}
          <View style={styles.section}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t("city") || "City"} *</Text>
              <View style={[styles.pickerContainer, cityError && styles.inputError, detectedCityId && styles.pickerDisabled]}>
                <Picker
                  selectedValue={cityId}
                  onValueChange={handleCityChange}
                  style={styles.picker}
                  enabled={!detectedCityId} // אם יש detectedCityId, לא ניתן לשנות
                >
                  <Picker.Item label={t("select_city") || "Select a city..."} value={undefined} />
                  {cities.map((city) => (
                    <Picker.Item
                      key={city.id}
                      label={city.name_ar || city.name_en || `City ${city.id}`}
                      value={city.id}
                    />
                  ))}
                </Picker>
              </View>
              {detectedCityId && (
                <Text style={styles.infoHelperText}>
                  {t("city_auto_detected") || "העיר נקבעה אוטומטית לפי המיקום שנבחר"}
                </Text>
              )}
              {cityError && <Text style={styles.fieldError}>{cityError}</Text>}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t("category") || "Category"} *</Text>
              <View style={[styles.pickerContainer, categoryError && styles.inputError]}>
                <Picker
                  selectedValue={categoryId}
                  onValueChange={handleCategoryChange}
                  style={styles.picker}
                >
                  <Picker.Item label={t("select_category") || "Select a category..."} value={undefined} />
                  {categories.map((cat) => (
                    <Picker.Item
                      key={cat.id}
                      label={cat.name_ar || cat.name_en || `Category ${cat.id}`}
                      value={cat.id}
                    />
                  ))}
                </Picker>
              </View>
              {categoryError && <Text style={styles.fieldError}>{categoryError}</Text>}
            </View>
          </View>

          {/* Contact Information Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("contact_information") || "Contact Information"}</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t("phone") || "Phone"} ({t("optional") || "Optional"})</Text>
              <TextInput
                style={[styles.input, phoneError && styles.inputError]}
                value={phone}
                onChangeText={handlePhoneChange}
                placeholder="0501234567"
                keyboardType="phone-pad"
                maxLength={10}
                placeholderTextColor="#9ab8bd"
              />
              {phoneError && <Text style={styles.fieldError}>{phoneError}</Text>}
            </View>
          </View>

          {/* Additional Information Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("additional_information") || "Additional Information"}</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t("description") || "Description"} ({t("optional") || "Optional"})</Text>
              <TextInput
                style={[styles.input, styles.textArea, styles.inputRTL]}
                value={description}
                onChangeText={setDescription}
                placeholder={t("describe_business") || "Describe your business..."}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                textAlign="right"
                placeholderTextColor="#9ab8bd"
                autoCorrect={false}
              />
            </View>
          </View>

          {/* Documents Section (Optional) */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("documents") || "Documents"} ({t("optional") || "Optional"})</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t("business_license") || "Business License"}</Text>
              <TouchableOpacity
                style={styles.uploadButton}
                onPress={handleUploadBusinessLicense}
                disabled={uploadingLicense}
              >
                {uploadingLicense ? (
                  <ActivityIndicator color={DARK_TEAL} />
                ) : businessLicenseUrl ? (
                  <View style={styles.imagePreviewContainer}>
                    <Image 
                      source={{ uri: businessLicenseUrl }} 
                      style={styles.imagePreview}
                      resizeMode="cover"
                      onLoad={() => console.log("[PREVIEW] businessLicenseUrl:", businessLicenseUrl)}
                    />
                    <Text style={styles.imagePreviewText}>{t("uploaded") || "Uploaded"} ✓</Text>
                  </View>
                ) : (
                  <View style={styles.uploadButtonContent}>
                    <Ionicons name="document-text-outline" size={24} color={DARK_TEAL} />
                    <Text style={styles.uploadButtonText}>{t("upload_business_license") || "Upload Business License"}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t("business_pictures") || "Business Pictures"}</Text>
              <TouchableOpacity
                style={styles.uploadButton}
                onPress={handleUploadBusinessImage}
                disabled={uploadingImages}
              >
                {uploadingImages ? (
                  <ActivityIndicator color={DARK_TEAL} />
                ) : (
                  <View style={styles.uploadButtonContent}>
                    <Ionicons name="camera-outline" size={24} color={DARK_TEAL} />
                    <Text style={styles.uploadButtonText}>{t("add_business_photo") || "Add Business Photo"}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {businessImagesUrls.length > 0 && (
              <View style={styles.imagesList}>
                {businessImagesUrls.map((url, index) => (
                  <View key={index} style={styles.imageItem}>
                    <Image 
                      source={{ uri: url }} 
                      style={styles.businessImage}
                      resizeMode="cover"
                      onLoad={() => console.log("[PREVIEW] businessImagesUrls url:", url)}
                    />
                    <TouchableOpacity
                      style={styles.removeImageButton}
                      onPress={() => handleRemoveBusinessImage(index)}
                    >
                      <Ionicons name="close-circle" size={24} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Social Media Section (Optional) */}
          <View style={styles.section}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t("social_media_account") || "Social Media Account"} ({t("optional") || "Optional"})</Text>
              <TextInput
                style={styles.input}
                value={socialMediaAccountName}
                onChangeText={setSocialMediaAccountName}
                placeholder={t("example_social_media") || "Example: @mybusiness or mybusiness_page"}
                autoCapitalize="none"
                placeholderTextColor="#9ab8bd"
              />
            </View>
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit}
            activeOpacity={0.8}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>
                {t("submit_request") || "Submit Request"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
      
      {/* Success/Error Modal */}
      <MessageModal
        visible={modalVisible}
        type={modalType}
        title={modalTitle}
        message={modalMessage}
        onClose={() => {
          setModalVisible(false);
          // If success modal, navigate to Home
          if (modalType === "success") {
            navigation.reset({
              index: 0,
              routes: [{ name: "Home" }],
            });
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: "#f5fdff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: DARK_TEAL,
    flex: 1,
    textAlign: "center",
  },
  headerSpacer: {
    width: 40,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 24,
  },
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f5fdff",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: DARK_TEAL,
  },
  infoBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#e8f4f6",
    padding: 12,
    borderRadius: 12,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: SOFT_TEAL,
  },
  infoBannerText: {
    fontSize: 13,
    color: DARK_TEAL,
    marginLeft: 8,
    flex: 1,
    textAlign: "right",
  },
  section: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#d6ebee",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: DARK_TEAL,
    marginBottom: 16,
    textAlign: "right",
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: DARK_TEAL,
    marginBottom: 8,
    textAlign: "right",
  },
  input: {
    backgroundColor: "#f5fdff",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#d6ebee",
    fontSize: 15,
    color: DARK_TEAL,
  },
  inputLTR: {
    textAlign: "left",
    writingDirection: "ltr",
  },
  inputRTL: {
    textAlign: "right",
    writingDirection: "rtl",
  },
  inputError: {
    borderColor: "#d7263d",
    borderWidth: 1.5,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  fieldError: {
    color: "#d7263d",
    fontSize: 12,
    marginTop: 6,
    textAlign: "right",
  },
  fieldErrorRTL: {
    textAlign: "right",
    writingDirection: "rtl",
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: "#d6ebee",
    borderRadius: 12,
    backgroundColor: "#f5fdff",
    overflow: "hidden",
  },
  pickerDisabled: {
    backgroundColor: "#e8f4f6",
    opacity: 0.7,
  },
  picker: {
    height: 50,
    color: DARK_TEAL,
  },
  infoHelperText: {
    color: SOFT_TEAL,
    fontSize: 12,
    marginTop: 6,
    textAlign: "right",
    fontStyle: "italic",
  },
  submitButton: {
    backgroundColor: DARK_TEAL,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    marginBottom: 24,
    shadowColor: DARK_TEAL,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  submitButtonDisabled: {
    backgroundColor: "#9ab8bd",
    opacity: 0.6,
  },
  submitButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  uploadButton: {
    borderWidth: 2,
    borderColor: MINT,
    borderStyle: "dashed",
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f5fdff",
    minHeight: 80,
  },
  uploadButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: "#f0f0f0",
  },
  imagePreviewText: {
    color: "#4CAF50",
    fontWeight: "600",
    fontSize: 12,
  },
  imagesList: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 12,
    gap: 12,
  },
  imageItem: {
    position: "relative",
  },
  businessImage: {
    width: 100,
    height: 100,
    borderRadius: 12,
    backgroundColor: "#f0f0f0",
  },
  removeImageButton: {
    position: "absolute",
    top: -8,
    right: -8,
    backgroundColor: "#d7263d",
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
});
