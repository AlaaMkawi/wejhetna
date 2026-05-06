// src/screens/businessOwner/ManageMyBusinessScreen.tsx

import React, { useState, useRef } from "react";
import { appAlert } from "../../utils/appAlert";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image, ActivityIndicator, Platform, StatusBar, Linking, Modal, I18nManager } from "react-native";
import { useNavigation, useFocusEffect, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Ionicons from "react-native-vector-icons/Ionicons";
import {
  isOpenNowFromRanges,
  DayName,
  parseOpeningHoursToSlotMap,
  formatHourSlotForStorage,
} from "../../utils/openingHours";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import { MapView, Camera, PointAnnotation } from "@maplibre/maplibre-react-native";
import { RootStackParamList } from "../../navigation/types";
import {
  getBusinessOwnerProfile,
  BusinessOwnerProfileOut,
  BusinessPlaceOut,
} from "../../api/businessOwnerApi";
import { updatePlace } from "../../api/places";
import i18n from "../../i18n";
import { launchImageLibrary } from "react-native-image-picker";
import MessageModal from "../MessageModal";
import { API_BASE_URL } from "../../../config";
import { uploadAssetToS3Presigned } from "../../api/upload";
import {
  collectBusinessImageUrls,
  formatApiImageUri,
  getValidImageUrl,
  logPlaceImageRenderDebug,
} from "../../utils/imageUrl";

const DARK_TEAL = "#0f5b63";
const SOFT_TEAL = "#3a8d96";
const MINT = "#9bd3d8";
const SOFT_HEADER = "#6b8a8f"; // Soft muted blue-gray-teal for header (softer than buttons)
const LIGHT_BLUE = "#a8d5e2"; // Light blue for business icon

const MAP_STYLE_URL =
  "https://api.maptiler.com/maps/019b0319-f856-79df-b13b-917c4a28f9a8/style.json?key=Js2mV1WY15ayeXH6ceQP";

type NavType = NativeStackNavigationProp<RootStackParamList>;
type ManageMyBusinessRoute = RouteProp<RootStackParamList, "ManageMyBusiness">;

export default function ManageMyBusinessScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavType>();
  const route = useRoute<ManageMyBusinessRoute>();
  const fromMap = route.params?.fromMap ?? false;
  const cameraRef = useRef<any>(null);

  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [, setProfile] = useState<BusinessOwnerProfileOut | null>(null);
  const [place, setPlace] = useState<BusinessPlaceOut | null>(null);
  const [lastLoadTime, setLastLoadTime] = useState<number>(0);

  // Edit states
  const [editingField, setEditingField] = useState<string | null>(null);

  // Form states
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [socialLink, setSocialLink] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [showSocialLinkModal, setShowSocialLinkModal] = useState(false);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false);
  const [showDescriptionModal, setShowDescriptionModal] = useState(false);
  // Opening hours structure: { day: { startHour, startPeriod, endHour, endPeriod } }
  type HourData = {
    startHour: string;
    startPeriod: "AM" | "PM";
    endHour: string;
    endPeriod: "AM" | "PM";
  } | null;
  
  const [openingHours, setOpeningHours] = useState<{ [key: string]: HourData }>({
    Sunday: null,
    Monday: { startHour: "08:00", startPeriod: "AM", endHour: "08:00", endPeriod: "PM" },
    Tuesday: { startHour: "08:00", startPeriod: "AM", endHour: "08:00", endPeriod: "PM" },
    Wednesday: null,
    Thursday: null,
    Friday: { startHour: "08:00", startPeriod: "AM", endHour: "08:00", endPeriod: "PM" },
    Saturday: { startHour: "08:00", startPeriod: "AM", endHour: "08:00", endPeriod: "PM" },
  });
  const [businessImages, setBusinessImages] = useState<string[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [deletingImageIndex, setDeletingImageIndex] = useState<number | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [imageErrors, setImageErrors] = useState<{ [key: number]: boolean }>({});
  const [imageLoading, setImageLoading] = useState<{ [key: number]: boolean }>({});
  const [uploadingImageTokens, setUploadingImageTokens] = useState<{ [token: string]: boolean }>({});
  const scrollViewRef = useRef<any>(null);
  
  // Message modal state
  const [messageModalVisible, setMessageModalVisible] = useState(false);
  const [messageModalType, setMessageModalType] = useState<"error" | "success">("success");
  const [messageModalTitle, setMessageModalTitle] = useState("");
  const [messageModalMessage, setMessageModalMessage] = useState("");
  
  // Helper function to show styled message
  const showMessage = (type: "error" | "success", title: string, message: string) => {
    setMessageModalType(type);
    setMessageModalTitle(title);
    setMessageModalMessage(message);
    setMessageModalVisible(true);
  };
  
  // Helper function to close message modal
  const closeMessage = () => {
    setMessageModalVisible(false);
  };
  
  // Picker modal state
  const [pickerModalVisible, setPickerModalVisible] = useState(false);
  const [pickerType, setPickerType] = useState<"startHour" | "startPeriod" | "endHour" | "endPeriod" | null>(null);
  const [pickerDay, setPickerDay] = useState<string>("");
  
  // Generate time options (01:00 to 12:45, 15-minute steps)
  const hourOptions = React.useMemo(() => {
    const minutes = ["00", "15", "30", "45"];
    const out: string[] = [];
    for (let h = 1; h <= 12; h++) {
      for (const m of minutes) {
        out.push(`${String(h).padStart(2, "0")}:${m}`);
      }
    }
    return out;
  }, []);
  
  const periodOptions = ["AM", "PM"];
  
  const formatPeriodLabel = (period: "AM" | "PM" | string): string => {
    if (period === "AM") return t("am") || "AM";
    if (period === "PM") return t("pm") || "PM";
    return period;
  };
  
  // Open picker modal
  const openPicker = (day: string, type: "startHour" | "startPeriod" | "endHour" | "endPeriod") => {
    setPickerDay(day);
    setPickerType(type);
    setPickerModalVisible(true);
  };
  
  // Handle picker selection
  const handlePickerSelect = (value: string) => {
    if (!pickerDay || !pickerType || !openingHours[pickerDay]) return;
    
    const currentHours = openingHours[pickerDay];
    if (!currentHours) return;
    
    setOpeningHours({
      ...openingHours,
      [pickerDay]: {
        ...currentHours,
        [pickerType]: value,
      },
    });
    setPickerModalVisible(false);
    setPickerType(null);
    setPickerDay("");
  };
  
  // Get current picker value
  const getPickerValue = (): string => {
    if (!pickerDay || !pickerType || !openingHours[pickerDay]) return "";
    const hours = openingHours[pickerDay];
    if (!hours) return "";
    return hours[pickerType] || "";
  };
  
  // Get picker options
  const getPickerOptions = (): string[] => {
    if (pickerType === "startPeriod" || pickerType === "endPeriod") {
      return periodOptions;
    }
    return hourOptions;
  };
  
  const parseOpeningHours = React.useCallback(
    (hoursString: string | null | undefined): { [key: string]: HourData } => {
      const slots = parseOpeningHoursToSlotMap(hoursString);
      const out: { [key: string]: HourData } = {
        Sunday: null,
        Monday: null,
        Tuesday: null,
        Wednesday: null,
        Thursday: null,
        Friday: null,
        Saturday: null,
      };
      for (const day of Object.keys(out) as DayName[]) {
        const s = slots[day];
        out[day] = s
          ? {
              startHour: s.startHour,
              startPeriod: s.startPeriod,
              endHour: s.endHour,
              endPeriod: s.endPeriod,
            }
          : null;
      }
      return out;
    },
    []
  );
  
  // Format hours for display
  const formatHours = (hours: HourData): string => {
    if (!hours) return "";
    return `${hours.startHour} ${formatPeriodLabel(hours.startPeriod)} - ${hours.endHour} ${formatPeriodLabel(hours.endPeriod)}`;
  };
  
  // Check if business is currently open
  const isCurrentlyOpen = (day: string, hours: HourData): boolean => {
    if (!hours) return false;
    
    const now = new Date();
    const dayMap: { [key: string]: number } = {
      Sunday: 0,
      Monday: 1,
      Tuesday: 2,
      Wednesday: 3,
      Thursday: 4,
      Friday: 5,
      Saturday: 6,
    };
    
    const [startH, startM] = hours.startHour.split(":").map(Number);
    const [endH, endM] = hours.endHour.split(":").map(Number);
    
    let startMinutes = startH * 60 + startM;
    let endMinutes = endH * 60 + endM;
    
    if (hours.startPeriod === "PM" && startH !== 12) startMinutes += 12 * 60;
    if (hours.startPeriod === "AM" && startH === 12) startMinutes -= 12 * 60;
    if (hours.endPeriod === "PM" && endH !== 12) endMinutes += 12 * 60;
    if (hours.endPeriod === "AM" && endH === 12) endMinutes -= 12 * 60;
    
    const startDayIdx = dayMap[day];
    if (startDayIdx == null) return false;
    const overnight = endMinutes <= startMinutes;
    return isOpenNowFromRanges(
      [
        {
          day: day as DayName,
          startMinutes,
          endMinutes,
          overnight,
        },
      ],
      now
    );
  };
  
  const loadBusinessData = React.useCallback(async (forceReload: boolean = false) => {
    try {
      // Cache: Don't reload if data was loaded less than 5 seconds ago (unless forced)
      const now = Date.now();
      if (!forceReload && lastLoadTime > 0 && (now - lastLoadTime) < 5000) {
        return; // Use cached data
      }

      setLoading(true);
      const userId = await AsyncStorage.getItem("userId");
      if (!userId) {
        const currentLanguage = i18n.language || "ar";
        const title = currentLanguage === "ar" ? "خطأ" : currentLanguage === "he" ? "שגיאה" : "Error";
        const message = currentLanguage === "ar" 
          ? "لم يتم العثور على معرف المستخدم"
          : currentLanguage === "he"
          ? "מזהה משתמש לא נמצא"
          : "User ID not found";
        showMessage("error", title, message);
        navigation.goBack();
        return;
      }

      const profileData = await getBusinessOwnerProfile(parseInt(userId, 10));
      setProfile(profileData);
      setPlace(profileData.place);
      setLastLoadTime(now);

      if (profileData.place) {
        setPhone(profileData.place.phone || "");
        setDescription(profileData.place.description || "");
        setLocation(
          profileData.place.city_name
            ? `${profileData.place.city_name}, Israel`
            : ""
        );
        setSocialLink(profileData.place.social_links || "");
        setAnnouncement(profileData.place.announcement || "");
        const uniqueImages = collectBusinessImageUrls(
          profileData.place.business_images_urls,
          profileData.place.main_image_url
        );
        
        // Debug logging
        if (__DEV__) {
          console.log("=== LOADING BUSINESS IMAGES ===");
          console.log("Raw business_images_urls:", profileData.place.business_images_urls);
          console.log("Raw main_image_url:", profileData.place.main_image_url);
          console.log("Filtered unique images:", uniqueImages);
          console.log("API_BASE_URL:", API_BASE_URL);
          uniqueImages.forEach((img, idx) => {
            const formatted = formatApiImageUri(img);
            console.log(`Image ${idx}:`, {
              original: img,
              formatted: formatted,
              isValid: formatted && formatted.startsWith('http')
            });
            // Test if URL is accessible (only in dev mode)
            if (formatted && formatted.startsWith('http')) {
              fetch(formatted, { method: 'HEAD' })
                .then(res => {
                  console.log(`✅ Image ${idx} URL accessible:`, formatted, "Status:", res.status);
                })
                .catch(err => {
                  console.error(`❌ Image ${idx} URL NOT accessible:`, formatted, "Error:", err.message);
                });
            }
          });
          console.log("=============================");
        }
        
        setBusinessImages(uniqueImages);
        // Reset image errors and loading states when loading new images
        setImageErrors({});
        setImageLoading({});
        // Parse and load opening hours
        if (profileData.place.opening_hours) {
          const parsedHours = parseOpeningHours(profileData.place.opening_hours);
          setOpeningHours(parsedHours);
        }
      }
    } catch (error: any) {
      const currentLanguage = i18n.language || "ar";
      const title = currentLanguage === "ar" ? "خطأ" : currentLanguage === "he" ? "שגיאה" : "Error";
      const message = error.message || (currentLanguage === "ar"
        ? "فشل تحميل بيانات العمل"
        : currentLanguage === "he"
        ? "נכשל בטעינת נתוני העסק"
        : "Failed to load business data");
      showMessage("error", title, message);
    } finally {
      setLoading(false);
    }
  }, [navigation, lastLoadTime, parseOpeningHours]);
  useFocusEffect(
    React.useCallback(() => {
      // Only reload if data is older than 30 seconds when screen comes into focus
      const now = Date.now();
      if (lastLoadTime === 0 || (now - lastLoadTime) > 30000) {
        loadBusinessData(false);
      }
    }, [loadBusinessData, lastLoadTime])
  );

  async function handleSaveField(field: string, fieldValue?: string): Promise<boolean> {
    if (!place) return false;

    try {
      setUpdating(true);

      const updateData: any = {};
      switch (field) {
        case "phone":
          // Phone validation (exactly 10 digits, must start with 05)
          const phoneCleaned = phone.trim().replace(/[^\d]/g, "");
          if (phoneCleaned.length > 0) {
            if (phoneCleaned.length !== 10) {
              setPhoneError(t("phone_must_be_10_digits") || "Phone number must be exactly 10 digits");
              setUpdating(false);
              return false;
            }
            if (!phoneCleaned.startsWith("05")) {
              setPhoneError(t("phone_must_start_with_05") || "Phone number must start with 05");
              setUpdating(false);
              return false;
            }
          }
          setPhoneError(null);
          updateData.phone = phoneCleaned || null;
          break;
        case "description":
          // Allow empty string to clear the description
          const descValue = description.trim();
          updateData.description = descValue.length > 0 ? descValue : null;
          break;
        case "social_link":
          updateData.social_links = socialLink.trim() || null;
          break;
        case "announcement":
          // Use fieldValue if provided (for deletion), otherwise use current state
          const announcementValue = fieldValue !== undefined ? fieldValue : announcement;
          const trimmedAnnouncement = announcementValue.trim();
          updateData.announcement = trimmedAnnouncement.length > 0 ? trimmedAnnouncement : null;
          break;
        case "opening_hours":
          // Persist canonical English AM/PM so parsing & "open now" stay in sync across locales
          const hoursString = Object.entries(openingHours)
            .map(([day, hours]) => {
              if (!hours) return null;
              return `${day}: ${formatHourSlotForStorage(hours)}`;
            })
            .filter(Boolean)
            .join(", ");
          updateData.opening_hours = hoursString || null;
          break;
      }

      await updatePlace(place.id, updateData);

      if (field === "opening_hours") {
        const saved = updateData.opening_hours ?? null;
        if (place) {
          setPlace({ ...place, opening_hours: saved });
        }
        setOpeningHours(parseOpeningHours(saved ?? undefined));
        setEditingField(null);
        showMessage(
          "success",
          t("success") || "Success",
          t("updated_successfully") || "Updated successfully"
        );
        return true;
      }

      // For announcement and description, don't reload - state is already updated and we want to keep scroll position
      if (field === "announcement" || field === "description") {
        // Get the value that was actually saved to backend
        const savedValue = updateData[field];
        // Ensure state is set to the value that was saved to backend
        if (field === "announcement") {
          // If savedValue is null (deleted), set to empty string to clear the UI
          const savedAnnouncement = savedValue || "";
          // Force state update to ensure UI reflects the deletion
          setAnnouncement(savedAnnouncement);
          // Update place object to reflect deletion
          if (place) {
            setPlace({ ...place, announcement: savedValue }); // Use savedValue directly (null if deleted)
          }
          // Force a re-render by updating a dummy state if needed
          // The announcement state should already be updated above
        } else if (field === "description") {
          // Use the trimmed description that was saved (or empty string if deleted)
          const trimmedDesc = description.trim();
          const savedDescription = trimmedDesc || "";
          // Only update if we're not deleting (i.e., if there's actual content)
          // If deleting, state is already cleared in the delete handler
          if (trimmedDesc) {
            setDescription(savedDescription);
            if (place) {
              setPlace({ ...place, description: savedDescription || null });
            }
          } else {
            // Ensure both are cleared for delete
            setDescription("");
            if (place) {
              setPlace({ ...place, description: null });
            }
          }
        }
        setEditingField(null);
        showMessage(
          "success",
          t("success") || "Success",
          t("updated_successfully") || "Updated successfully"
        );
        return true;
      }

      // Reload data (force reload after update) for other fields
      await loadBusinessData(true);

      setEditingField(null);

      showMessage(
        "success",
        t("success") || "Success",
        t("updated_successfully") || "Updated successfully"
      );
      return true;
    } catch (error: any) {
      console.error("Error updating field:", error);
      showMessage(
        "error",
        t("error") || "Error",
        error.message || t("failed_to_update") || "Failed to update"
      );
      return false;
    } finally {
      setUpdating(false);
    }
  }

  /** Same sanitization as EditPlace submit: drop placeholders and invalid sentinels before PUT /admin/places */
  function sanitizeBusinessImagesForApi(images: string[]): {
    business_images_urls: string[] | null;
    main_image_url: string | null;
  } {
    const cleaned = images
      .filter(
        (u) =>
          typeof u === "string" &&
          u.length > 0 &&
          !u.startsWith("__uploading__")
      )
      .map((u) => getValidImageUrl(u))
      .filter((u): u is string => u != null);
    if (cleaned.length === 0) {
      return { business_images_urls: null, main_image_url: null };
    }
    return {
      business_images_urls: cleaned,
      main_image_url: getValidImageUrl(cleaned[0]),
    };
  }

  // Handle image upload
  async function handleAddPhoto() {
    if (businessImages.length >= 20) {
      showMessage(
        "error",
        t("error") || "Error",
        t("max_photos_reached") || "Maximum 20 photos allowed"
      );
      return;
    }

    launchImageLibrary(
      {
        mediaType: "photo",
        quality: 0.8,
        selectionLimit: 1,
        includeBase64: true,
      },
      async (res) => {
        if (__DEV__) console.log("[UPLOAD] picker response:", res);
        if (res.didCancel || res.errorCode) {
          return;
        }

        const asset = res.assets?.[0];
        if (!asset || !asset.uri) return;

        // Insert a placeholder token immediately; avoid rendering a broken intermediate Image
        const placeholderToken = `__uploading__${Date.now()}_${Math.random().toString(16).slice(2)}`;
        setBusinessImages((prev) => [...prev, placeholderToken]);
        setUploadingImageTokens((prev) => ({ ...prev, [placeholderToken]: true }));
        setUploadingImage(true);

        // Upload in background
        (async () => {
          try {
            // Small defer to avoid immediate-select race from the picker
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
            await new Promise<void>((resolve) => setTimeout(resolve, 150));
            let fileUrl: string | null = null;
            let lastError: any = null;
            for (let attempt = 1; attempt <= 2; attempt++) {
              try {
                fileUrl = await uploadAssetToS3Presigned({
                  uri: asset.uri,
                  fileName: asset.fileName,
                  type: asset.type,
                  base64: (asset as any).base64,
                });
                lastError = null;
                break;
              } catch (err: any) {
                lastError = err;
                const msg = err?.message || String(err);
                if (attempt < 2 && /Network request failed/i.test(msg)) {
                  await new Promise<void>((r) => setTimeout(r, 300));
                  continue;
                }
                break;
              }
            }
            if (lastError) {
              throw lastError;
            }

            if (fileUrl) {
              if (__DEV__) console.log("[UPLOAD] file_url:", fileUrl);
              // Replace placeholder with final S3 URL (avoid stale state)
              setBusinessImages((prev) => {
                const next = prev.map((img) => (img === placeholderToken ? fileUrl : img));
                // Save to backend in background
                saveBusinessImages(next).catch((error) => {
                  console.error("Background save error:", error);
                  const currentLanguage = i18n.language || "ar";
                  const title = currentLanguage === "ar" ? "تحذير" : currentLanguage === "he" ? "אזהרה" : "Warning";
                  const message = currentLanguage === "ar"
                    ? "تمت إضافة الصورة لكن فشل الحفظ. يرجى المحاولة مرة أخرى."
                    : currentLanguage === "he"
                    ? "התמונה נוספה אבל השמירה נכשלה. אנא נסה שוב."
                    : "Image added but failed to save. Please try again.";
                  showMessage("error", title, message);
                });
                return next;
              });
              setUploadingImageTokens((prev) => {
                const next = { ...prev };
                delete next[placeholderToken];
                return next;
              });
            } else {
              // Remove the placeholder if upload failed
              setBusinessImages((prev) => prev.filter((img) => img !== placeholderToken));
              setUploadingImageTokens((prev) => {
                const next = { ...prev };
                delete next[placeholderToken];
                return next;
              });
              const currentLanguage = i18n.language || "ar";
              const title = currentLanguage === "ar" ? "خطأ" : currentLanguage === "he" ? "שגיאה" : "Error";
              const message = currentLanguage === "ar"
                ? "فشل تحميل الصورة"
                : currentLanguage === "he"
                ? "העלאת התמונה נכשלה"
                : "Failed to upload image";
              showMessage("error", title, message);
            }
          } catch (e: any) {
            console.log("Upload error", e?.message || e);
            // Remove the placeholder if upload failed
            setBusinessImages((prev) => prev.filter((img) => img !== placeholderToken));
            setUploadingImageTokens((prev) => {
              const next = { ...prev };
              delete next[placeholderToken];
              return next;
            });
            const currentLanguage = i18n.language || "ar";
            const title = currentLanguage === "ar" ? "خطأ" : currentLanguage === "he" ? "שגיאה" : "Error";
            const message = currentLanguage === "ar"
              ? `فشل تحميل الصورة: ${e?.message || "خطأ غير معروف"}`
              : currentLanguage === "he"
              ? `העלאת התמונה נכשלה: ${e?.message || "שגיאה לא ידועה"}`
              : `Failed to upload image: ${e?.message || "Unknown error"}`;
            showMessage("error", title, message);
          } finally {
            setUploadingImage(false);
          }
        })();
      }
    );
  }

  // Save business images to backend (no reload to prevent scroll reset)
  async function saveBusinessImages(images: string[]) {
    if (!place) return;

    try {
      const { business_images_urls, main_image_url } =
        sanitizeBusinessImagesForApi(images);
      const updateData: any = {
        business_images_urls,
        main_image_url,
      };

      await updatePlace(place.id, updateData);
      
      // Never reload to prevent scroll reset - state is already updated
      // The backend is the source of truth, but we keep UI state in sync manually
    } catch (error: any) {
      console.error("Error saving images:", error);
      throw error; // Re-throw so caller can handle if needed
    }
  }

  // Handle image deletion (no reload to prevent scroll reset)
  async function handleDeletePhoto(index: number) {
    appAlert(
      t("delete_photo") || "Delete Photo",
      t("delete_photo_confirmation") || "Are you sure you want to delete this photo?",
      [
        {
          text: t("cancel") || "Cancel",
          style: "cancel"
        },
        {
          text: t("delete") || "Delete",
          style: "destructive",
          onPress: async () => {
            setDeletingImageIndex(index);
            try {
              const newImages = businessImages.filter((_, i) => i !== index);
              // Update UI immediately
              setBusinessImages(newImages);
              // Save to backend (no reload to prevent scroll reset)
              await saveBusinessImages(newImages);
            } catch (error: any) {
              // Revert on error - restore original images
              await loadBusinessData(true);
              const currentLanguage = i18n.language || "ar";
              const title = currentLanguage === "ar" ? "خطأ" : currentLanguage === "he" ? "שגיאה" : "Error";
              const message = error.message || (currentLanguage === "ar"
                ? "فشل حذف الصورة"
                : currentLanguage === "he"
                ? "מחיקת התמונה נכשלה"
                : "Failed to delete image");
              showMessage("error", title, message);
            } finally {
              setDeletingImageIndex(null);
            }
          }
        }
      ]
    );
  }

  function getPlaceName(): string {
    if (!place) return "";
    const currentLanguage = i18n.language || "ar";
    if (currentLanguage === "he" && place.name_he) return place.name_he;
    if (currentLanguage === "ar" && place.name_ar) return place.name_ar;
    return place.name;
  }

  function getDayName(day: string): string {
    const dayKey = `day_${day.toLowerCase()}`;
    return t(dayKey) || day;
  }

  // Handle image load error
  const handleImageError = (error: any, index: number) => {
    const originalUri = businessImages[index];
    const formattedUri = formatApiImageUri(originalUri);
    console.warn(`❌ Image ${index} failed to load:`, {
      original: originalUri,
      formatted: formattedUri,
      error: error?.nativeEvent?.error || error,
      errorCode: error?.nativeEvent?.error?.code,
      errorMessage: error?.nativeEvent?.error?.message
    });
    
    // Test URL accessibility in dev mode
    if (__DEV__ && formattedUri) {
      fetch(formattedUri, { method: 'HEAD' })
        .then(res => {
          console.log(`🔍 Fetch test for image ${index}:`, formattedUri, "Status:", res.status, res.statusText);
        })
        .catch(err => {
          console.error(`🔍 Fetch test failed for image ${index}:`, formattedUri, "Error:", err.message);
        });
    }
    
    setImageErrors((prev) => ({ ...prev, [index]: true }));
    setImageLoading((prev) => ({ ...prev, [index]: false }));
  };

  // Handle image load success
  const handleImageLoad = (index: number) => {
    if (__DEV__) {
      console.log(`✅ Image ${index} loaded successfully:`, formatApiImageUri(businessImages[index]));
    }
    setImageLoading((prev) => ({ ...prev, [index]: false }));
    setImageErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors[index];
      return newErrors;
    });
  };

  // Handle image load start
  const handleImageLoadStart = (index: number) => {
    if (__DEV__) {
      console.log(`🔄 Image ${index} loading:`, formatApiImageUri(businessImages[index]));
    }
    setImageLoading((prev) => ({ ...prev, [index]: true }));
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={DARK_TEAL} />
        <Text style={styles.loadingText}>{t("loading") || "טוען..."}</Text>
      </View>
    );
  }

  if (!place) {
    return (
      <View style={styles.center}>
        <Text style={styles.noPlaceText}>
          {t("no_business_found") || "No business found"}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <StatusBar barStyle="light-content" />

      {/* Header - Dark Blue */}
      <View style={styles.header}>
        {fromMap && navigation.canGoBack() ? (
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        ) : (
          <View style={styles.backButton} />
        )}
        <Text style={styles.headerTitle}>
          {t("manage_my_business") || "Manage My Business"}
        </Text>
        <View style={styles.bellButton} />
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Business Name Section */}
        <View style={styles.businessNameSection}>
          <View style={styles.businessNameRow}>
            <View style={styles.businessIconContainer}>
              <MaterialCommunityIcons
                name="store"
                size={24}
                color={LIGHT_BLUE}
              />
            </View>
            <View style={styles.businessNameContainer}>
              <Text style={styles.businessNameLabel}>
                {t("business_name") || "Business Name"}
              </Text>
              <View style={styles.businessNameTextRow}>
                <Text style={styles.businessName}>{getPlaceName()}</Text>
                {place.name && place.name !== getPlaceName() && (
                  <Text style={styles.businessNameEnglish}>
                    ({place.name})
                  </Text>
                )}
              </View>
              <View style={styles.approvedBadge}>
                <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
                <Text style={styles.approvedText}>
                  {t("approved_by_admin") || "Approved by Admin"}
                </Text>
              </View>
            </View>
            {place.lat && place.lon && (
              <View style={styles.mapThumbnail}>
                <MapView
                  style={styles.mapView}
                  mapStyle={MAP_STYLE_URL}
                  logoEnabled={false}
                  attributionEnabled={false}
                  zoomEnabled={false}
                  scrollEnabled={false}
                  pitchEnabled={false}
                  rotateEnabled={false}
                >
                  <Camera
                    ref={cameraRef}
                    defaultSettings={{
                      centerCoordinate: [place.lon, place.lat],
                      zoomLevel: 16,
                    }}
                  />
                  <PointAnnotation
                    id="business-location"
                    coordinate={[place.lon, place.lat]}
                  >
                    <View style={styles.markerContainer}>
                      <Ionicons name="location" size={20} color="#FF0000" />
                    </View>
                  </PointAnnotation>
                </MapView>
              </View>
            )}
          </View>
        </View>

        {/* Edit Business Info Section */}
        <View style={styles.section}>
          <View style={[styles.sectionHeader, I18nManager.isRTL && styles.sectionHeaderRTL]}>
            <Text style={[styles.sectionTitle, I18nManager.isRTL && styles.sectionTitleRTL]}>
              {t("edit_business_info") || "Edit Business Info"}
            </Text>
          </View>

          {/* Business Description - First Item */}
          <View style={styles.infoRow}>
            <Ionicons name="document-text-outline" size={20} color={DARK_TEAL} />
            <Text style={styles.infoText}>
              {description || place?.description || t("not_set") || "Not set"}
            </Text>
            <TouchableOpacity
              onPress={() => setShowDescriptionModal(true)}
              style={styles.editLinkButton}
            >
              <Ionicons name="create-outline" size={18} color={DARK_TEAL} />
            </TouchableOpacity>
          </View>

          {/* Phone Number */}
          <View style={styles.infoRow}>
            <Ionicons name="call-outline" size={20} color={DARK_TEAL} />
            <Text style={styles.infoText}>
              {phone || t("not_set") || "Not set"}
            </Text>
            <TouchableOpacity
              onPress={() => setShowPhoneModal(true)}
              style={styles.editLinkButton}
            >
              <Ionicons name="create-outline" size={18} color={DARK_TEAL} />
            </TouchableOpacity>
          </View>

          {/* Location */}
          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={20} color={DARK_TEAL} />
            <Text style={styles.infoText}>{location || "Al-Qasom, Israel"}</Text>
          </View>

          {/* Social Link Display or Add */}
          {socialLink ? (
            <View style={styles.infoRow}>
              <Ionicons name="link-outline" size={20} color={DARK_TEAL} />
              <TouchableOpacity
                style={styles.socialLinkContainer}
                onPress={() => {
                  const url = socialLink.startsWith('http') ? socialLink : `https://${socialLink}`;
                  Linking.openURL(url).catch(err => {
                      console.error(err);
                      const currentLanguage = i18n.language || "ar";
                      const title = currentLanguage === "ar" ? "خطأ" : currentLanguage === "he" ? "שגיאה" : "Error";
                      const message = currentLanguage === "ar"
                        ? "لا يمكن فتح الرابط"
                        : currentLanguage === "he"
                        ? "לא ניתן לפתוח את הקישור"
                        : "Could not open link";
                      showMessage("error", title, message);
                  });
                }}
              >
                <Text style={styles.socialLinkText} numberOfLines={1}>
                  {socialLink}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowSocialLinkModal(true)}
                style={styles.editLinkButton}
              >
                <Ionicons name="create-outline" size={18} color={DARK_TEAL} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity 
              style={styles.addSocialLink}
              onPress={() => setShowSocialLinkModal(true)}
            >
              <Ionicons name="link-outline" size={20} color={DARK_TEAL} />
              <Text style={styles.addSocialLinkText}>
                + {t("add_social_link") || "Add social link"}
              </Text>
            </TouchableOpacity>
          )}

          {/* Phone Number Modal */}
          <Modal
            visible={showPhoneModal}
            transparent={true}
            animationType="slide"
            onRequestClose={() => setShowPhoneModal(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>
                    {t("edit_phone_number") || "Edit Phone Number"}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setPhone(place?.phone || "");
                      setPhoneError(null);
                      setShowPhoneModal(false);
                    }}
                    style={styles.modalCloseButton}
                  >
                    <Ionicons name="close" size={24} color={DARK_TEAL} />
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={[styles.modalInput, phoneError && styles.modalInputError]}
                  value={phone}
                  onChangeText={(text) => {
                    // Only allow digits, and ensure it starts with 05 if user types
                    const digitsOnly = text.replace(/[^\d]/g, "");
                    // If user types first digit and it's not 0, don't allow it
                    if (digitsOnly.length === 1 && digitsOnly !== "0") {
                      return;
                    }
                    // If user types second digit and first is 0 but second is not 5, don't allow it
                    if (digitsOnly.length === 2 && digitsOnly[0] === "0" && digitsOnly[1] !== "5") {
                      return;
                    }
                    // Limit to 10 digits
                    const limitedDigits = digitsOnly.slice(0, 10);
                    setPhone(limitedDigits);
                    setPhoneError(null);
                  }}
                  placeholder={t("phone_placeholder") || "05X-XXXXXXX"}
                  placeholderTextColor="#9ab8bd"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="phone-pad"
                />
                {phoneError && (
                  <Text style={styles.errorText}>{phoneError}</Text>
                )}
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.modalCancelButton]}
                    onPress={() => {
                      setPhone(place?.phone || "");
                      setPhoneError(null);
                      setShowPhoneModal(false);
                    }}
                  >
                    <Text style={styles.modalCancelText}>
                      {t("cancel") || "Cancel"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.modalSaveButton]}
                    onPress={async () => {
                      const success = await handleSaveField("phone");
                      if (success) {
                        setShowPhoneModal(false);
                      }
                    }}
                    disabled={updating}
                  >
                    {updating ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.modalSaveText}>
                        {t("save") || "Save"}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          {/* Social Link Modal */}
          <Modal
            visible={showSocialLinkModal}
            transparent={true}
            animationType="slide"
            onRequestClose={() => setShowSocialLinkModal(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>
                    {socialLink ? t("edit_social_link") || "Edit Social Link" : t("add_social_link") || "Add Social Link"}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setShowSocialLinkModal(false)}
                    style={styles.modalCloseButton}
                  >
                    <Ionicons name="close" size={24} color={DARK_TEAL} />
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={styles.modalInput}
                  value={socialLink}
                  onChangeText={setSocialLink}
                  placeholder={t("social_link_placeholder") || "https://facebook.com/yourpage or https://instagram.com/yourpage"}
                  placeholderTextColor="#9ab8bd"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  contextMenuHidden={false}
                />
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.modalCancelButton]}
                    onPress={() => {
                      setSocialLink(place?.social_links || "");
                      setShowSocialLinkModal(false);
                    }}
                  >
                    <Text style={styles.modalCancelText}>
                      {t("cancel") || "Cancel"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.modalSaveButton]}
                    onPress={async () => {
                      await handleSaveField("social_link");
                      setShowSocialLinkModal(false);
                    }}
                    disabled={updating}
                  >
                    {updating ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.modalSaveText}>
                        {t("save") || "Save"}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          {/* Description Modal */}
          <Modal
            visible={showDescriptionModal}
            transparent={true}
            animationType="slide"
            onRequestClose={() => setShowDescriptionModal(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>
                    {description ? t("edit_description") || "Edit Description" : t("add_description") || "Add Description"}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setDescription(place?.description || "");
                      setShowDescriptionModal(false);
                    }}
                    style={styles.modalCloseButton}
                  >
                    <Ionicons name="close" size={24} color={DARK_TEAL} />
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={[styles.modalInput, styles.descriptionTextArea]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder={t("description_placeholder") || "Write about your business, services, special offers..."}
                  placeholderTextColor="#9ab8bd"
                  multiline={true}
                  numberOfLines={6}
                  textAlignVertical="top"
                  maxLength={1000}
                />
                <Text style={styles.characterCount}>
                  {description.length}/1000
                </Text>
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.modalCancelButton]}
                    onPress={() => {
                      setDescription(place?.description || "");
                      setShowDescriptionModal(false);
                    }}
                  >
                    <Text style={styles.modalCancelText}>
                      {t("cancel") || "Cancel"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.modalSaveButton]}
                    onPress={async () => {
                      const success = await handleSaveField("description");
                      if (success) {
                        // State is already updated in handleSaveField
                        setShowDescriptionModal(false);
                      }
                    }}
                    disabled={updating}
                  >
                    {updating ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.modalSaveText}>
                        {t("save") || "Save"}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        </View>

        {/* Announcement Section */}
        <View style={styles.section}>
          <View style={[styles.sectionHeader, I18nManager.isRTL && styles.sectionHeaderRTL]}>
            <Text style={[styles.sectionTitle, I18nManager.isRTL && styles.sectionTitleRTL]}>
              {t("announcement") || "Announcement"}
            </Text>
            <TouchableOpacity onPress={() => setShowAnnouncementModal(true)}>
              <Ionicons name="create-outline" size={20} color={DARK_TEAL} />
            </TouchableOpacity>
          </View>
          
          {announcement && announcement.trim() ? (
            <View style={styles.announcementBox}>
              <Text style={styles.announcementText}>{announcement}</Text>
              <TouchableOpacity
                style={styles.deleteAnnouncementButton}
                onPress={async () => {
                  appAlert(
                    t("delete_announcement") || "Delete Announcement",
                    t("delete_announcement_confirmation") || "Are you sure you want to delete this announcement?",
                    [
                      {
                        text: t("cancel") || "Cancel",
                        style: "cancel"
                      },
                      {
                        text: t("delete") || "Delete",
                        style: "destructive",
                        onPress: async () => {
                          // Clear state immediately using functional update to ensure it works
                          setAnnouncement(() => "");
                          // Update place object immediately to reflect deletion in UI
                          if (place) {
                            setPlace((prevPlace) => ({ ...prevPlace, announcement: null }));
                          }
                          // Pass empty string directly to handleSaveField to ensure it uses the deleted value
                          await handleSaveField("announcement", "");
                          // Force a final state update after save to ensure UI reflects deletion
                          setAnnouncement(() => "");
                          if (place) {
                            setPlace((prevPlace) => ({ ...prevPlace, announcement: null }));
                          }
                        }
                      }
                    ]
                  );
                }}
              >
                <Ionicons name="trash-outline" size={18} color="#ff6b6b" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity 
              style={styles.addAnnouncementButton}
              onPress={() => setShowAnnouncementModal(true)}
            >
              <Ionicons name="megaphone-outline" size={20} color={DARK_TEAL} />
              <Text style={styles.addAnnouncementText}>
                + {t("add_announcement") || "Add Announcement"}
              </Text>
            </TouchableOpacity>
          )}

          {/* Announcement Modal */}
          <Modal
            visible={showAnnouncementModal}
            transparent={true}
            animationType="slide"
            onRequestClose={() => setShowAnnouncementModal(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>
                    {announcement ? t("update_announcement") || "Update Announcement" : t("add_announcement") || "Add Announcement"}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setAnnouncement(place?.announcement || "");
                      setShowAnnouncementModal(false);
                    }}
                    style={styles.modalCloseButton}
                  >
                    <Ionicons name="close" size={24} color={DARK_TEAL} />
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={[styles.modalInput, styles.announcementTextArea]}
                  value={announcement}
                  onChangeText={setAnnouncement}
                  placeholder={t("announcement_placeholder") || "Today only 20% discount..."}
                  placeholderTextColor="#9ab8bd"
                  multiline={true}
                  numberOfLines={4}
                  textAlignVertical="top"
                  maxLength={500}
                />
                <Text style={styles.characterCount}>
                  {announcement.length}/500
                </Text>
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.modalCancelButton]}
                    onPress={() => {
                      // Reset to saved value on cancel
                      const savedAnnouncement = place?.announcement || "";
                      setAnnouncement(savedAnnouncement);
                      setShowAnnouncementModal(false);
                    }}
                  >
                    <Text style={styles.modalCancelText}>
                      {t("cancel") || "Cancel"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.modalSaveButton]}
                    onPress={async () => {
                      const success = await handleSaveField("announcement");
                      if (success) {
                        // Keep the announcement state as is (already updated from input)
                        setShowAnnouncementModal(false);
                      }
                    }}
                    disabled={updating}
                  >
                    {updating ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.modalSaveText}>
                        {t("save") || "Save"}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        </View>

        {/* Opening and Closing Hours Section */}
        <View style={styles.section}>
          <View style={[styles.sectionHeader, I18nManager.isRTL && styles.sectionHeaderRTL]}>
            {editingField === "opening_hours" && (
              <TouchableOpacity
                style={styles.saveChangesButton}
                onPress={() => handleSaveField("opening_hours")}
                disabled={updating}
              >
                {updating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveChangesText}>
                    {t("save_changes") || "Save Changes"}
                  </Text>
                )}
              </TouchableOpacity>
            )}
            <Text style={[styles.sectionTitle, I18nManager.isRTL && styles.sectionTitleRTL]}>
              {t("opening_and_closing_hours") || "Opening and Closing Hours"}
            </Text>
          </View>

          {/* Table Header */}
          <View style={styles.hoursHeaderRow}>
            <Text style={[styles.hoursHeaderCell, styles.hoursHeaderDay]}>
              {t("day") || "Day"}
            </Text>
            <Text style={[styles.hoursHeaderCell, styles.hoursHeaderHours]}>
              {t("hours") || "Hours"}
            </Text>
            <Text style={[styles.hoursHeaderCell, styles.hoursHeaderStatus]}>
              {t("status") || "Status"}
            </Text>
          </View>

          {Object.entries(openingHours).map(([day, hours]) => {
            const isOpen = hours !== null;
            const currentlyOpen = isOpen && isCurrentlyOpen(day, hours);
            return (
              <View key={day} style={styles.hoursRow}>
                <View style={styles.hoursDayCol}>
                  <Text style={styles.dayText} numberOfLines={1}>
                    {getDayName(day)}
                  </Text>
                </View>

                {editingField === "opening_hours" ? (
                  <View style={styles.hoursPickerContainer}>
                    {hours ? (
                      <>
                        <View style={styles.pickerRow}>
                          <TouchableOpacity
                            style={styles.pickerButton}
                            onPress={() => openPicker(day, "startHour")}
                          >
                            <Text style={styles.pickerButtonText} numberOfLines={1}>
                              {hours.startHour}
                            </Text>
                            <Ionicons name="chevron-down" size={12} color={DARK_TEAL} style={{ marginLeft: 4 }} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.pickerButtonPeriod}
                            onPress={() => openPicker(day, "startPeriod")}
                          >
                            <Text style={styles.pickerButtonText} numberOfLines={1}>
                              {formatPeriodLabel(hours.startPeriod)}
                            </Text>
                            <Ionicons name="chevron-down" size={12} color={DARK_TEAL} style={{ marginLeft: 2 }} />
                          </TouchableOpacity>
                          <Text style={styles.pickerSeparator}>-</Text>
                          <TouchableOpacity
                            style={styles.pickerButton}
                            onPress={() => openPicker(day, "endHour")}
                          >
                            <Text style={styles.pickerButtonText} numberOfLines={1}>
                              {hours.endHour}
                            </Text>
                            <Ionicons name="chevron-down" size={12} color={DARK_TEAL} style={{ marginLeft: 4 }} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.pickerButtonPeriod}
                            onPress={() => openPicker(day, "endPeriod")}
                          >
                            <Text style={styles.pickerButtonText} numberOfLines={1}>
                              {formatPeriodLabel(hours.endPeriod)}
                            </Text>
                            <Ionicons name="chevron-down" size={12} color={DARK_TEAL} style={{ marginLeft: 2 }} />
                          </TouchableOpacity>
                        </View>
                        <TouchableOpacity
                          style={styles.removeHoursButton}
                          onPress={() =>
                            setOpeningHours({ ...openingHours, [day]: null })
                          }
                        >
                          <Text style={styles.removeHoursText}>
                            {t("remove_hours") || "Remove Hours"}
                          </Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <TouchableOpacity
                        style={styles.addHoursButton}
                        onPress={() =>
                          setOpeningHours({
                            ...openingHours,
                            [day]: {
                              startHour: "08:00",
                              startPeriod: "AM",
                              endHour: "08:00",
                              endPeriod: "PM",
                            },
                          })
                        }
                      >
                        <Text style={styles.addHoursText}>
                          {t("add_hours") || "Add Hours"}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ) : (
                  <View style={styles.hoursValueCol}>
                    <Text style={styles.hoursText} numberOfLines={1}>
                      {hours ? formatHours(hours) : t("closed") || "Closed"}
                    </Text>
                  </View>
                )}

                <View style={styles.hoursStatusCol}>
                  {currentlyOpen ? (
                    <View style={[styles.statusBadge, styles.statusOpen]}>
                      <Text style={styles.statusText}>
                        {t("open_now") || "Open now"}
                      </Text>
                    </View>
                  ) : isOpen ? (
                    <View style={[styles.statusBadge, styles.statusClosed]}>
                      <Text style={styles.statusText}>
                        {t("open") || "Open"}
                      </Text>
                    </View>
                  ) : (
                    <View style={[styles.statusBadge, styles.statusClosed]}>
                      <Text style={styles.statusText}>
                        {t("closed") || "Closed"}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })}

          {editingField !== "opening_hours" && (
            <TouchableOpacity
              style={styles.updateHoursButton}
              onPress={() => setEditingField("opening_hours")}
            >
              <Text style={styles.updateHoursText}>
                {t("update_hours") || "Update Hours"}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Picker Modal */}
        <Modal
          visible={pickerModalVisible}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setPickerModalVisible(false)}
        >
          <View style={styles.pickerModalOverlay}>
            <View style={styles.pickerModalContent}>
              <View style={styles.pickerModalHeader}>
                <Text style={styles.pickerModalTitle}>
                  {pickerType === "startHour" || pickerType === "endHour"
                    ? t("select_hour") || "Select Hour"
                    : t("select_period") || "Select Period"}
                </Text>
                <TouchableOpacity
                  onPress={() => setPickerModalVisible(false)}
                  style={styles.pickerModalCloseButton}
                >
                  <Ionicons name="close" size={24} color={DARK_TEAL} />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.pickerModalList}>
                {getPickerOptions().map((option) => (
                  <TouchableOpacity
                    key={option}
                    style={[
                      styles.pickerModalItem,
                      getPickerValue() === option && styles.pickerModalItemSelected,
                    ]}
                    onPress={() => handlePickerSelect(option)}
                  >
                    <Text
                      style={[
                        styles.pickerModalItemText,
                        getPickerValue() === option && styles.pickerModalItemTextSelected,
                      ]}
                    >
                      {option}
                    </Text>
                    {getPickerValue() === option && (
                      <Ionicons name="checkmark" size={20} color={DARK_TEAL} />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Photo Gallery Section */}
        <View style={styles.section}>
          <View style={[styles.sectionHeader, I18nManager.isRTL && styles.sectionHeaderRTL]}>
            <Text style={[styles.sectionTitle, I18nManager.isRTL && styles.sectionTitleRTL]}>
              {t("photo_gallery") || "Photo Gallery"}
            </Text>
            {businessImages.length < 20 && (
              <TouchableOpacity 
                onPress={handleAddPhoto}
                disabled={uploadingImage}
              >
                <Text style={styles.addPhotoText}>
                  + {t("add_photo") || "Add Photo"} &gt;
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.photoGallery}>
            {place &&
              (() => {
                const fromApi = collectBusinessImageUrls(
                  place.business_images_urls,
                  place.main_image_url
                );
                logPlaceImageRenderDebug(
                  "ManageMyBusiness:gallery",
                  place,
                  fromApi
                );
                if (__DEV__) {
                  console.log("[PlaceImageDebug ManageMyBusiness:businessImagesState]", {
                    placeId: place.id,
                    businessImagesState: businessImages,
                    stateUrisForImage: businessImages.map((u) => formatApiImageUri(u)),
                  });
                }
                return null;
              })()}
            {/* Display existing photos */}
            {businessImages.map((imageUri, index) => {
              const hasError = imageErrors[index];
              const isLoading = imageLoading[index];
              const isUploadingThis = !!uploadingImageTokens[imageUri];
              const formattedUri = formatApiImageUri(imageUri);
              
              // Skip rendering if URI is invalid
              if (isUploadingThis) {
                return (
                  <View key={`image-uploading-${index}`} style={styles.photoItem}>
                    <View style={styles.photoContainer}>
                      <View style={[styles.photo, { backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" }]}>
                        <ActivityIndicator size="small" color="#fff" />
                        <Text style={[styles.photoErrorText, { marginTop: 8, color: "#fff" }]}>
                          {t("uploading") || "Uploading..."}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              }

              if (!imageUri || !formattedUri) return null;
              
              return (
                <View key={`image-${index}-${imageUri?.substring(0, 20) || index}`} style={styles.photoItem}>
                  <TouchableOpacity
                    onPress={() => setSelectedImageIndex(index)}
                    activeOpacity={0.9}
                  >
                    {hasError ? (
                      <View style={styles.photoErrorPlaceholder}>
                        <Ionicons name="image-outline" size={32} color="#999" />
                        <Text style={styles.photoErrorText} numberOfLines={2}>
                          {t("image_failed_to_load") || "Failed to load"}
                        </Text>
                        {__DEV__ && (
                          <Text style={[styles.photoErrorText, { fontSize: 8, marginTop: 4 }]} numberOfLines={1}>
                            {formattedUri.substring(0, 30)}...
                          </Text>
                        )}
                      </View>
                    ) : (
                      <View style={styles.photoContainer}>
                        <Image
                          source={{ uri: formattedUri }}
                          style={styles.photo}
                          onError={(e) => handleImageError(e, index)}
                          onLoad={() => handleImageLoad(index)}
                          onLoadStart={() => handleImageLoadStart(index)}
                          resizeMode="cover"
                        />
                        {isLoading && (
                          <View style={styles.photoLoadingOverlay}>
                            <ActivityIndicator size="small" color="#fff" />
                          </View>
                        )}
                      </View>
                    )}
                  </TouchableOpacity>
                  {deletingImageIndex === index ? (
                    <View style={styles.photoLoadingOverlay}>
                      <ActivityIndicator size="small" color="#fff" />
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.photoDeleteButton}
                      onPress={() => handleDeletePhoto(index)}
                      disabled={deletingImageIndex !== null || uploadingImage}
                    >
                      <Ionicons name="close-circle" size={24} color="#ff6b6b" />
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
            
            {/* Add photo placeholders for remaining slots (max 20 total) */}
            {businessImages.length < 20 && (
              <TouchableOpacity 
                style={styles.addPhotoPlaceholder}
                onPress={handleAddPhoto}
                disabled={uploadingImage}
              >
                {uploadingImage ? (
                  <ActivityIndicator size="small" color={DARK_TEAL} />
                ) : (
                  <>
                    <Ionicons name="camera-outline" size={32} color={DARK_TEAL} />
                    <Text style={styles.addPhotoPlaceholderText}>
                      {t("add_photo") || "Add Photo"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Full-Screen Image Viewer Modal */}
        <Modal
          visible={selectedImageIndex !== null}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setSelectedImageIndex(null)}
        >
          <View style={styles.fullScreenImageContainer}>
            <TouchableOpacity
              style={styles.fullScreenImageCloseButton}
              onPress={() => setSelectedImageIndex(null)}
            >
              <Ionicons name="close" size={32} color="#fff" />
            </TouchableOpacity>
            {selectedImageIndex !== null && businessImages[selectedImageIndex] && (() => {
              const fullScreenUri = formatApiImageUri(businessImages[selectedImageIndex]);
              return (
                <Image
                  source={{ uri: fullScreenUri }}
                  style={styles.fullScreenImage}
                  resizeMode="contain"
                  onError={(e) => {
                    if (__DEV__) {
                      console.error(`❌ Full-screen image failed:`, {
                        original: businessImages[selectedImageIndex],
                        formatted: fullScreenUri,
                        error: e?.nativeEvent?.error || e
                      });
                    }
                    // Don't show alert - just close the modal silently
                    setSelectedImageIndex(null);
                  }}
                  onLoad={() => {
                    if (__DEV__) {
                      console.log(`✅ Full-screen image loaded:`, fullScreenUri);
                    }
                  }}
                />
              );
            })()}
          </View>
        </Modal>

        {/* Styled Message Modal */}
        <MessageModal
          visible={messageModalVisible}
          type={messageModalType}
          title={messageModalTitle}
          message={messageModalMessage}
          onClose={closeMessage}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: "#fff",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: DARK_TEAL,
  },
  noPlaceText: {
    fontSize: 16,
    color: DARK_TEAL,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 50 : 16,
    paddingBottom: 12,
    backgroundColor: SOFT_HEADER,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
    flex: 1,
    textAlign: "center",
  },
  bellButton: {
    padding: 4,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 24,
  },
  businessNameSection: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  businessNameRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  businessIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: LIGHT_BLUE,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  businessNameContainer: {
    flex: 1,
  },
  businessNameLabel: {
    fontSize: 12,
    color: SOFT_TEAL,
    marginBottom: 4,
  },
  businessNameTextRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    marginBottom: 8,
  },
  businessName: {
    fontSize: 20,
    fontWeight: "700",
    color: "#000",
  },
  businessNameEnglish: {
    fontSize: 16,
    fontWeight: "400",
    color: "#666",
    marginLeft: 8,
  },
  approvedBadge: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  approvedText: {
    fontSize: 12,
    color: "#4CAF50",
    marginLeft: 4,
  },
  mapThumbnail: {
    width: 80,
    height: 60,
    borderRadius: 8,
    overflow: "hidden",
    marginLeft: 12,
    backgroundColor: "#e0e0e0",
    borderWidth: 1,
    borderColor: "#d0d0d0",
  },
  mapView: {
    width: "100%",
    height: "100%",
  },
  markerContainer: {
    alignItems: "center",
    justifyContent: "center",
    width: 24,
    height: 24,
  },
  section: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sectionHeaderRTL: {
    flexDirection: "row-reverse",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: DARK_TEAL,
    textAlign: "left",
  },
  sectionTitleRTL: {
    textAlign: "right",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  infoContent: {
    flex: 1,
    marginLeft: 12,
  },
  infoTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  infoLabel: {
    fontSize: 12,
    color: "#666",
    marginBottom: 4,
    fontWeight: "500",
  },
  infoRowContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  infoText: {
    fontSize: 14,
    color: "#000",
    flex: 1,
    marginLeft: 12,
  },
  editButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  editButtonText: {
    fontSize: 14,
    color: DARK_TEAL,
    fontWeight: "600",
  },
  editContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  editInput: {
    flex: 1,
    backgroundColor: "#f5fdff",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#d6ebee",
    fontSize: 14,
    color: "#000",
  },
  textArea: {
    minHeight: 60,
    textAlignVertical: "top",
  },
  checkButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: DARK_TEAL,
    justifyContent: "center",
    alignItems: "center",
  },
  addSocialLink: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },
  addSocialLinkText: {
    fontSize: 14,
    color: "#000",
    fontWeight: "600",
    marginLeft: 12,
  },
  hoursRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
    gap: 10,
  },
  hoursHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e8eef0",
    gap: 10,
  },
  hoursHeaderCell: {
    fontSize: 12,
    color: "#3b4b4f",
    fontWeight: "700",
  },
  hoursHeaderDay: { width: 82 },
  hoursHeaderHours: { flex: 1 },
  hoursHeaderStatus: { width: 92, textAlign: "right" },
  hoursDayCol: {
    width: 82,
  },
  hoursValueCol: {
    flex: 1,
    minWidth: 0,
  },
  hoursStatusCol: {
    width: 92,
    alignItems: "flex-end",
  },
  dayIndicators: {
    flexDirection: "row",
    marginRight: 8,
    gap: 4,
  },
  dayDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: SOFT_TEAL,
  },
  dayText: {
    fontSize: 14,
    color: "#000",
    fontWeight: "500",
  },
  hoursText: {
    fontSize: 14,
    color: "#000",
    flexShrink: 1,
  },
  hoursPickerContainer: {
    flex: 1,
    minWidth: 0,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  pickerButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f5fdff",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#d6ebee",
    paddingHorizontal: 8,
    paddingVertical: 6,
    minHeight: 32,
    maxHeight: 32,
    minWidth: 74,
  },
  pickerButtonPeriod: {
    width: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f5fdff",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#d6ebee",
    paddingHorizontal: 6,
    paddingVertical: 6,
    minHeight: 32,
    maxHeight: 32,
  },
  pickerButtonText: {
    fontSize: 12,
    color: "#000",
    fontWeight: "500",
    textAlign: "center",
  },
  pickerSeparator: {
    fontSize: 14,
    color: DARK_TEAL,
    fontWeight: "600",
    marginHorizontal: 6,
  },
  addHoursButton: {
    backgroundColor: DARK_TEAL,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  addHoursText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  removeHoursButton: {
    marginTop: 8,
    paddingVertical: 4,
  },
  removeHoursText: {
    color: "#ff6b6b",
    fontSize: 12,
    fontWeight: "600",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  statusOpen: {
    backgroundColor: "#4CAF50",
  },
  statusClosed: {
    backgroundColor: "#ff6b6b",
  },
  statusText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "600",
  },
  saveChangesButton: {
    backgroundColor: DARK_TEAL,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  saveChangesText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  updateHoursButton: {
    backgroundColor: DARK_TEAL,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 16,
  },
  updateHoursText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  photoGallery: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  photoItem: {
    width: 100,
    height: 100,
    borderRadius: 8,
    overflow: "hidden",
    position: "relative",
  },
  photoContainer: {
    width: "100%",
    height: "100%",
    position: "relative",
  },
  photo: {
    width: "100%",
    height: "100%",
  },
  photoDeleteButton: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    borderRadius: 12,
    padding: 2,
  },
  photoLoadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  photoErrorPlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: "#f5f5f5",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 8,
  },
  photoErrorText: {
    fontSize: 10,
    color: "#999",
    marginTop: 4,
    textAlign: "center",
  },
  addPhotoPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: MINT,
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f5fdff",
  },
  addPhotoPlaceholderText: {
    fontSize: 12,
    color: DARK_TEAL,
    marginTop: 4,
  },
  addPhotoText: {
    fontSize: 14,
    color: "#000",
    fontWeight: "600",
  },
  socialLinkContainer: {
    flex: 1,
    marginLeft: 12,
  },
  socialLinkText: {
    fontSize: 14,
    color: "#000",
    textDecorationLine: "underline",
  },
  editLinkButton: {
    padding: 4,
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    width: "85%",
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: DARK_TEAL,
  },
  modalCloseButton: {
    padding: 4,
  },
  modalInput: {
    backgroundColor: "#f5fdff",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#d6ebee",
    fontSize: 14,
    color: "#000",
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  modalButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  modalCancelButton: {
    backgroundColor: "transparent",
  },
  modalCancelText: {
    fontSize: 14,
    color: "#000",
    fontWeight: "600",
  },
  modalSaveButton: {
    backgroundColor: DARK_TEAL,
  },
  modalSaveText: {
    fontSize: 14,
    color: "#fff",
    fontWeight: "600",
  },
  modalInputError: {
    borderColor: "#ff6b6b",
    borderWidth: 2,
  },
  errorText: {
    fontSize: 12,
    color: "#ff6b6b",
    marginTop: 4,
    marginBottom: 8,
  },
  pickerModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  pickerModalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "50%",
    paddingBottom: Platform.OS === "ios" ? 20 : 0,
  },
  pickerModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  pickerModalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: DARK_TEAL,
  },
  pickerModalCloseButton: {
    padding: 4,
  },
  pickerModalList: {
    maxHeight: 300,
  },
  pickerModalItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  pickerModalItemSelected: {
    backgroundColor: "#f5fdff",
  },
  pickerModalItemText: {
    fontSize: 16,
    color: "#000",
  },
  pickerModalItemTextSelected: {
    color: DARK_TEAL,
    fontWeight: "600",
  },
  fullScreenImageContainer: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  fullScreenImage: {
    width: "100%",
    height: "100%",
  },
  fullScreenImageCloseButton: {
    position: "absolute",
    top: Platform.OS === "ios" ? 50 : 20,
    right: 20,
    zIndex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    borderRadius: 20,
    padding: 8,
  },
  announcementBox: {
    backgroundColor: "#f5fdff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#d6ebee",
    borderLeftWidth: 4,
    borderLeftColor: DARK_TEAL,
    position: "relative",
  },
  announcementText: {
    fontSize: 14,
    color: "#000",
    lineHeight: 20,
    paddingRight: 30,
  },
  deleteAnnouncementButton: {
    position: "absolute",
    top: 12,
    right: 12,
    padding: 4,
  },
  addAnnouncementButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },
  addAnnouncementText: {
    fontSize: 14,
    color: "#000",
    fontWeight: "600",
    marginLeft: 12,
  },
  announcementTextArea: {
    minHeight: 100,
    textAlignVertical: "top",
    marginBottom: 8,
  },
  characterCount: {
    fontSize: 12,
    color: SOFT_TEAL,
    textAlign: "right",
    marginBottom: 12,
  },
  descriptionBox: {
    backgroundColor: "#f5fdff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#d6ebee",
    borderLeftWidth: 4,
    borderLeftColor: SOFT_TEAL,
    position: "relative",
    marginTop: 8,
  },
  descriptionText: {
    fontSize: 14,
    color: "#000",
    lineHeight: 20,
    paddingRight: 60,
  },
  deleteDescriptionButton: {
    position: "absolute",
    top: 12,
    right: 12,
    padding: 4,
  },
  editDescriptionButton: {
    position: "absolute",
    top: 12,
    right: 40,
    padding: 4,
  },
  addDescriptionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    marginTop: 8,
  },
  addDescriptionText: {
    fontSize: 14,
    color: "#000",
    fontWeight: "600",
    marginLeft: 12,
  },
  descriptionTextArea: {
    minHeight: 120,
    textAlignVertical: "top",
    marginBottom: 8,
  },
});
