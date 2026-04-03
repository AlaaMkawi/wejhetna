// src/screens/businessOwner/BusinessOwnerHomeScreen.tsx

import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Image,
  PanResponder,
  StatusBar,
  Dimensions,
  TextInput,
  Linking,
  Modal,
  ActivityIndicator,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { MapView, Camera, PointAnnotation } from "@maplibre/maplibre-react-native";
import { useRoute, RouteProp, useFocusEffect, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";
import Geolocation from "@react-native-community/geolocation";
import { fetchAllPlaces, PlaceForMap, savePlace, unsavePlace, checkIfPlaceSaved, checkLocationInServiceCities, Category, translateText } from "../../api/places";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Ionicons from 'react-native-vector-icons/Ionicons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import i18n from "../../i18n";
import { useTranslation } from "react-i18next";
import { API_BASE_URL } from "../../../config";
import {
  collectBusinessImageUrls,
  formatApiImageUri,
  logPlaceImageRenderDebug,
} from "../../utils/imageUrl";

const MAP_STYLE_URL =
  "https://api.maptiler.com/maps/019b0319-f856-79df-b13b-917c4a28f9a8/style.json?key=Js2mV1WY15ayeXH6ceQP";

const INITIAL_CENTER: [number, number] = [34.83, 31.24];
const INITIAL_ZOOM = 12.5;

// Zoom thresholds for displaying different types of places
// At zoom < 13: Only roads and city outlines (handled by MapTiler style)
// At zoom 13-14: Road names appear (handled by MapTiler style)
// At zoom 15-16.4: Only PUBLIC_SERVICE places appear with icons
// At zoom 16.5+: All places (PUBLIC_SERVICE + BUSINESS) appear with icons
const PUBLIC_SERVICE_ZOOM_THRESHOLD = 15; // Show public services (mosques, schools, clinics) at zoom 15+
const BUSINESS_ZOOM_THRESHOLD = 16.5; // Show businesses at zoom 16.5+ (only after public services are already visible)

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');
const BOTTOM_TAB_HEIGHT = 80; // גובה הבאנל התחתון (עם ה-rounded corners)
const BOTTOM_SHEET_MIN_HEIGHT = 360; // גובה מינימלי של ה-bottom sheet
const BOTTOM_SHEET_MAX_HEIGHT = SCREEN_HEIGHT * 0.75; // גובה מקסימלי (75% מהמסך)
const BOTTOM_SHEET_OFFSET = 25; // מרחק נוסף מעל ה-tab bar (ללא חפיפה)

const NEGEV_BOUNDS = {
  ne: [35.10, 31.42],
  sw: [34.72, 31.18],
};

// Helper function to get place name based on current language
const getPlaceName = (place: PlaceForMap): string => {
  const currentLanguage = i18n.language || "ar";
  
  if (currentLanguage === "he" && place.name_he) {
    return place.name_he;
  } else if (currentLanguage === "ar" && place.name_ar) {
    return place.name_ar;
  } else if (place.name) {
    return place.name; // fallback to English name
  }
  
  // Ultimate fallback
  return place.name_he || place.name_ar || place.name || "";
};

// Helper function to get city name based on current language
const getCityName = (city: { name_ar?: string; name_he?: string; name_en?: string } | undefined): string => {
  if (!city) return "";
  
  const currentLanguage = i18n.language || "ar";
  
  if (currentLanguage === "he" && city.name_he) {
    return city.name_he;
  } else if (currentLanguage === "ar" && city.name_ar) {
    return city.name_ar;
  } else if (city.name_en) {
    return city.name_en;
  }
  
  return city.name_ar || city.name_he || city.name_en || "";
};

// Helper function to get icon for a place based on category and type
const getPlaceIcon = (place: PlaceForMap) => {
  const categoryName = place.category?.name_ar?.toLowerCase() || place.category?.name_en?.toLowerCase() || '';
  const iconName = place.category?.icon_name?.toLowerCase() || '';
  
  // For public services
  if (place.place_type === 'PUBLIC_SERVICE') {
    if (categoryName.includes('מסגד') || categoryName.includes('mosque') || iconName.includes('mosque')) {
      return { type: 'mosque', color: '#4285F4' };
    }
    if (categoryName.includes('בית ספר') || categoryName.includes('school') || iconName.includes('school')) {
      return { type: 'school', color: '#34A853' };
    }
    if (categoryName.includes('קופת חולים') || categoryName.includes('clinic') || categoryName.includes('מרפאה') || iconName.includes('clinic') || iconName.includes('hospital')) {
      return { type: 'clinic', color: '#EA4335' };
    }
    if (categoryName.includes('גן ילדים') || categoryName.includes('kindergarten') || iconName.includes('kindergarten')) {
      return { type: 'kindergarten', color: '#FBBC04' };
    }
    if (categoryName.includes('מרכז קהילתי') || categoryName.includes('community') || iconName.includes('community')) {
      return { type: 'community', color: '#9AA0A6' };
    }
    if (categoryName.includes('בית') || categoryName.includes('home') || categoryName.includes('منزل') || iconName.includes('home') || iconName.includes('house')) {
      return { type: 'home', color: '#FF9800' };
    }
    // Default public service icon
    return { type: 'public', color: '#4285F4' };
  }
  
  // For businesses - use category icon or default business icon
  if (place.place_type === 'BUSINESS') {
    if (iconName) {
      return { type: 'business', color: '#EA4335', iconName: iconName };
    }
    return { type: 'business', color: '#EA4335' };
  }
  
  return { type: 'default', color: '#4285F4' };
};

// Helper function to get category name based on current language
const getCategoryName = (category: Category | null | undefined): string => {
  if (!category) return "";

  const currentLanguage = i18n.language || "ar";

  if (currentLanguage === "he" && category.name_he) {
    return category.name_he;
  } else if (currentLanguage === "ar" && category.name_ar) {
    return category.name_ar;
  } else if (category.name_en) {
    return category.name_en;
  }

  return category.name_ar || category.name_he || category.name_en || "";
};

// Helper function to parse opening hours into day-by-day format
const parseOpeningHours = (openingHours: string | null | undefined): Array<{day: string, hours: string, isToday: boolean}> => {
  if (!openingHours) return [];

  const now = new Date();
  const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayNamesLocalized = {
    he: ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"],
    ar: ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"],
  };
  
  const currentLanguage = i18n.language || "ar";
  const localizedDays = currentLanguage === "he" ? dayNamesLocalized.he : dayNamesLocalized.ar;

  const dayEntries = openingHours.split(",").map(s => s.trim());
  const parsed: Array<{day: string, hours: string, isToday: boolean}> = [];
  
  // Initialize all days
  for (let i = 0; i < 7; i++) {
    const dayName = dayNames[i];
    const localizedDayName = localizedDays[i];
    const isToday = i === currentDay;
    
    // Find matching entry
    const entry = dayEntries.find(e => e.toLowerCase().startsWith(dayName.toLowerCase() + ":"));
    
    if (entry) {
      const match = entry.match(new RegExp(`${dayName}:\\s*(.+)`, "i"));
      if (match) {
        parsed.push({
          day: localizedDayName,
          hours: match[1].trim(),
          isToday,
        });
      } else {
        parsed.push({ day: localizedDayName, hours: "", isToday });
      }
    } else {
      parsed.push({ day: localizedDayName, hours: "", isToday });
    }
  }
  
  return parsed;
};

// Helper function to get opening hours status text
const getOpeningHoursStatus = (openingHours: string | null | undefined): string => {
  if (!openingHours) {
    return i18n.language === "ar" ? "مغلق" : "סגור";
  }

  const now = new Date();
  const currentDay = now.getDay();
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayNamesLocalized = {
    he: ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"],
    ar: ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"],
  };
  
  const currentLanguage = i18n.language || "ar";
  const localizedDays = currentLanguage === "he" ? dayNamesLocalized.he : dayNamesLocalized.ar;
  const currentDayName = dayNames[currentDay];
  
  const dayEntries = openingHours.split(",").map(s => s.trim());
  
  // Check if currently open
  for (const entry of dayEntries) {
    const match = entry.match(new RegExp(`${currentDayName}:\\s*(\\d+):(\\d+)\\s*(AM|PM)\\s*-\\s*(\\d+):(\\d+)\\s*(AM|PM)`, "i"));
    if (match) {
      const [, startH, startM, startP, endH, endM, endP] = match;
      
      const startHour = parseInt(startH, 10);
      const startMin = parseInt(startM, 10);
      const endHour = parseInt(endH, 10);
      const endMin = parseInt(endM, 10);
      
      let startMinutes = startHour * 60 + startMin;
      let endMinutes = endHour * 60 + endMin;
      
      if (startP.toUpperCase() === "PM" && startHour !== 12) startMinutes += 12 * 60;
      if (startP.toUpperCase() === "AM" && startHour === 12) startMinutes -= 12 * 60;
      if (endP.toUpperCase() === "PM" && endHour !== 12) endMinutes += 12 * 60;
      if (endP.toUpperCase() === "AM" && endHour === 12) endMinutes -= 12 * 60;
      
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      
      if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
        return currentLanguage === "ar" ? "مفتوح" : "פתוח";
      }
    }
  }
  
  // Find next opening time
  for (let i = 0; i < 7; i++) {
    const checkDay = (currentDay + i) % 7;
    const checkDayName = dayNames[checkDay];
    const localizedDayName = localizedDays[checkDay];
    
    const entry = dayEntries.find(e => e.toLowerCase().startsWith(checkDayName.toLowerCase() + ":"));
    if (entry) {
      const match = entry.match(new RegExp(`${checkDayName}:\\s*(\\d+):(\\d+)\\s*(AM|PM)`, "i"));
      if (match) {
        const [, hour, minute, period] = match;
        const statusText = currentLanguage === "ar" ? "مغلق" : "סגור";
        const opensText = currentLanguage === "ar" ? "يفتح" : "פתוח ב";
        if (i === 0) {
          return `${statusText} · ${opensText} ${hour}:${minute} ${period}`;
        } else {
          return `${statusText} · ${opensText} ${hour}:${minute} ${period} ${localizedDayName}`;
        }
      }
    }
  }
  
  return i18n.language === "ar" ? "مغلق" : "סגור";
};

// Helper function to check if business is currently open
const isBusinessCurrentlyOpen = (openingHours: string | null | undefined): boolean => {
  if (!openingHours) return false;

  const now = new Date();
  const currentDay = now.getDay();
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const currentDayName = dayNames[currentDay];

  const dayEntries = openingHours.split(",").map(s => s.trim());
  
  for (const entry of dayEntries) {
    const match = entry.match(new RegExp(`${currentDayName}:\\s*(\\d+):(\\d+)\\s*(AM|PM)\\s*-\\s*(\\d+):(\\d+)\\s*(AM|PM)`, "i"));
    if (match) {
      const [, startH, startM, startP, endH, endM, endP] = match;
      
      const startHour = parseInt(startH, 10);
      const startMin = parseInt(startM, 10);
      const endHour = parseInt(endH, 10);
      const endMin = parseInt(endM, 10);
      
      let startMinutes = startHour * 60 + startMin;
      let endMinutes = endHour * 60 + endMin;
      
      if (startP.toUpperCase() === "PM" && startHour !== 12) startMinutes += 12 * 60;
      if (startP.toUpperCase() === "AM" && startHour === 12) startMinutes -= 12 * 60;
      if (endP.toUpperCase() === "PM" && endHour !== 12) endMinutes += 12 * 60;
      if (endP.toUpperCase() === "AM" && endHour === 12) endMinutes -= 12 * 60;
      
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    }
  }
  
  return false;
};
type Props = {
  navigation: any;
  route?: RouteProp<any, any>;
};

type RouteCoordinates = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: {
      type: "LineString";
      coordinates: [number, number][];
    };
    properties: Record<string, any>;
  }>;
};

export default function BusinessOwnerHomeScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const routeParams = useRoute();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const selectedPlaceIdFromParams = (routeParams.params as any)?.selectedPlaceId as number | undefined;
  const cameraRef = useRef<any>(null);

  // Places
  const [places, setPlaces] = useState<PlaceForMap[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<PlaceForMap | null>(null);
  const selectedPlaceIdRef = useRef<number | null>(null);
  const [currentZoom, setCurrentZoom] = useState(INITIAL_ZOOM);

  // Save/Unsave place
  const [isPlaceSaved, setIsPlaceSaved] = useState(false);
  const [savingPlace, setSavingPlace] = useState(false);
  const [userId, setUserId] = useState<number | null>(null);

  // Ref for ScrollView to reset scroll position when place changes
  const scrollViewRef = useRef<ScrollView>(null);

  // GPS Location
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [hasShownLocationPermissionMessage, setHasShownLocationPermissionMessage] = useState(false);

  // Destination
  const [destination, setDestination] = useState<{ lat: number; lon: number; name?: string } | null>(null);
  const [customPin, setCustomPin] = useState<{ lat: number; lon: number } | null>(null);

  // Route
  const [routeLoading, setRouteLoading] = useState(false);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PlaceForMap[]>([]);
  const [showSearchModal, setShowSearchModal] = useState(false);

  // Opening hours expand state
  const [openingHoursExpanded, setOpeningHoursExpanded] = useState(false);

  // Translation states
  const [announcementTranslated, setAnnouncementTranslated] = useState<string | null>(null);
  const [announcementIsTranslated, setAnnouncementIsTranslated] = useState(false);
  const [announcementTranslating, setAnnouncementTranslating] = useState(false);
  const [announcementTargetLang, setAnnouncementTargetLang] = useState<"ar" | "he" | null>(null);
  
  const [descriptionTranslated, setDescriptionTranslated] = useState<string | null>(null);
  const [descriptionIsTranslated, setDescriptionIsTranslated] = useState(false);
  const [descriptionTranslating, setDescriptionTranslating] = useState(false);
  const [descriptionTargetLang, setDescriptionTargetLang] = useState<"ar" | "he" | null>(null);

  // Language selector modal state
  const [showLanguageSelector, setShowLanguageSelector] = useState(false);
  const [languageSelectorType, setLanguageSelectorType] = useState<"announcement" | "description" | null>(null);

  // Photo gallery modal
  const [photoModalVisible, setPhotoModalVisible] = useState(false);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  const photoScrollViewRef = useRef<ScrollView>(null);

  // Helper function to detect language (currently unused but kept for future use)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const detectLanguage = (text: string): "ar" | "he" | "en" => {
    const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
    const hebrewChars = (text.match(/[\u0590-\u05FF]/g) || []).length;
    const englishChars = (text.match(/[a-zA-Z]/g) || []).length;
    
    if (arabicChars > hebrewChars && arabicChars > englishChars) return "ar";
    if (hebrewChars > arabicChars && hebrewChars > englishChars) return "he";
    return "en";
  };

  // Load user ID from AsyncStorage
  useEffect(() => {
    async function loadUserId() {
      try {
        const storedUserId = await AsyncStorage.getItem("userId");
        if (storedUserId) {
          setUserId(parseInt(storedUserId, 10));
        }
      } catch (error) {
        console.error("Error loading user ID:", error);
      }
    }
    loadUserId();
  }, []);

  // Get user's GPS location
  useEffect(() => {
    setLocationLoading(true);
    
    Geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation({ lat: latitude, lon: longitude });
        setLocationLoading(false);
      },
      (error) => {
        console.log("GPS error", error);
        const currentLanguage = i18n.language || "ar";
        let title = "";
        let message = "";
        
        // Handle different error codes
        if (error.code === 1) {
          // PERMISSION_DENIED - Show initial permission message only once
          if (!hasShownLocationPermissionMessage) {
            title = currentLanguage === "ar"
              ? "السماح بالموقع"
              : currentLanguage === "he"
              ? "אפשר גישת מיקום"
              : "Allow Location Access";
            message = currentLanguage === "ar"
              ? "يجب السماح للتطبيق بالوصول إلى موقعك لاستخدام ميزة الموقع ورؤية موقعك الحالي كنقطة بداية للمسارات."
              : currentLanguage === "he"
              ? "אנא אפשר לאפליקציה גישה למיקום שלך כדי להשתמש בתכונת המיקום ולראות את המיקום הנוכחי שלך כנקודת התחלה למסלולים."
              : "Please allow the app to access your location to use the location feature and see your current location as the starting point for routes.";
            setHasShownLocationPermissionMessage(true);
          } else {
            title = currentLanguage === "ar" 
              ? "السماح بالموقع مطلوب" 
              : currentLanguage === "he"
              ? "נדרש אישור מיקום"
              : "Location Permission Required";
            message = currentLanguage === "ar"
              ? "يجب السماح للتطبيق بالوصول إلى موقعك لاستخدام ميزة الموقع. يرجى تفعيل الموقع في إعدادات الجهاز."
              : currentLanguage === "he"
              ? "יש לאפשר לאפליקציה גישה למיקום שלך כדי להשתמש בתכונת המיקום. אנא הפעל את המיקום בהגדרות המכשיר."
              : "The app needs access to your location to use the location feature. Please enable location in device settings.";
          }
        } else if (error.code === 2) {
          // POSITION_UNAVAILABLE
          title = currentLanguage === "ar"
            ? "الموقع غير متاح"
            : currentLanguage === "he"
            ? "מיקום לא זמין"
            : "Location Unavailable";
          message = currentLanguage === "ar"
            ? "لا يمكن تحديد موقعك. يرجى التأكد من تفعيل GPS في إعدادات الجهاز."
            : currentLanguage === "he"
            ? "לא ניתן לקבוע את המיקום שלך. אנא ודא ש-GPS מופעל בהגדרות המכשיר."
            : "Unable to determine your location. Please make sure GPS is enabled in device settings.";
        } else if (error.code === 3) {
          // TIMEOUT
          title = currentLanguage === "ar"
            ? "انتهت مهلة انتظار الموقع"
            : currentLanguage === "he"
            ? "זמן המיקום פג"
            : "Location Timeout";
          message = currentLanguage === "ar"
            ? "استغرق الحصول على موقعك وقتاً طويلاً. يرجى المحاولة مرة أخرى."
            : currentLanguage === "he"
            ? "קבלת המיקום שלך ארכה זמן רב מדי. אנא נסה שוב."
            : "Getting your location took too long. Please try again.";
        } else {
          // Generic error
          title = currentLanguage === "ar"
            ? "خطأ في الموقع"
            : currentLanguage === "he"
            ? "שגיאת מיקום"
            : "Location Error";
          message = currentLanguage === "ar"
            ? "لا يمكن الحصول على موقعك. سيتم استخدام موقع افتراضي."
            : currentLanguage === "he"
            ? "לא ניתן לקבל את המיקום שלך. ייעשה שימוש במיקום ברירת מחדל."
            : "Could not get your location. Using default location.";
        }
        
        const allowText = currentLanguage === "ar" ? "السماح" : currentLanguage === "he" ? "אפשר" : "Allow";
        const cancelText = currentLanguage === "ar" ? "إلغاء" : currentLanguage === "he" ? "ביטול" : "Cancel";
        
        Alert.alert(
          title,
          message,
          [
            {
              text: cancelText,
              style: "cancel"
            },
            {
              text: allowText,
              onPress: () => {
                if (error.code === 1) {
                  Linking.openSettings();
                }
              }
            }
          ]
        );
        setLocationLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 10000,
      }
    );
  }, [t, hasShownLocationPermissionMessage]);

  // Fetch all places on mount and when screen is focused
  useFocusEffect(
    React.useCallback(() => {
      async function load() {
        try {
          const data = await fetchAllPlaces();
          setPlaces(data);
          
          // Determine which place to select
          let placeIdToSelect: number | undefined = selectedPlaceIdFromParams;
          
          // If no placeId from params but we have a selectedPlaceId in ref, keep it selected (update with fresh data)
          if (!placeIdToSelect && selectedPlaceIdRef.current) {
            placeIdToSelect = selectedPlaceIdRef.current;
          }
          
          // Find and select the place
          if (placeIdToSelect) {
            const place = data.find(p => p.id === placeIdToSelect);
            if (place) {
              selectedPlaceIdRef.current = place.id;
              setSelectedPlace(place);
              // Center map on place location
              if (cameraRef.current) {
                cameraRef.current.setCamera({
                  centerCoordinate: [place.location.lon, place.location.lat],
                  zoomLevel: 16,
                  animationDuration: 1000,
                });
              }
            }
          }
        } catch (e) {
          console.error("Failed to load places:", e);
        }
      }
      load();
    }, [selectedPlaceIdFromParams])
  );

  // Handle selectedPlaceId from navigation params (from SavedPlacesScreen)
  useEffect(() => {
    if (selectedPlaceIdFromParams && places.length > 0) {
      const place = places.find(p => p.id === selectedPlaceIdFromParams);
      if (place) {
        selectedPlaceIdRef.current = place.id;
        setSelectedPlace(place);
        // Center camera on the place location
        if (place.location && cameraRef.current) {
          cameraRef.current.setCamera({
            centerCoordinate: [place.location.lon, place.location.lat],
            zoomLevel: 16.5,
            animationDuration: 1000,
          });
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlaceIdFromParams, places]);

  // Check if place is saved when selected
  useEffect(() => {
    async function checkSaved() {
      if (selectedPlace && userId) {
        try {
          const saved = await checkIfPlaceSaved(userId, selectedPlace.id);
          setIsPlaceSaved(saved);
        } catch (error) {
          console.error("Error checking if place is saved:", error);
          setIsPlaceSaved(false);
        }
      } else {
        setIsPlaceSaved(false);
      }
    }
    checkSaved();
  }, [selectedPlace, userId]);

  // Handle save/unsave place
  const handleToggleSave = async () => {
    if (!selectedPlace || !userId) return;
    
    setSavingPlace(true);
    try {
      if (isPlaceSaved) {
        await unsavePlace(userId, selectedPlace.id);
        setIsPlaceSaved(false);
        Alert.alert(
          t("success") || "הצלחה",
          t("place_removed_from_saved") || "המקום הוסר מהשמורים"
        );
      } else {
        await savePlace(userId, selectedPlace.id);
        setIsPlaceSaved(true);
        Alert.alert(
          t("success") || "הצלחה",
          t("place_saved_successfully") || "המקום נשמר בהצלחה"
        );
      }
    } catch (error: any) {
      Alert.alert(
        t("error") || "שגיאה",
        error.message || t("failed_to_save_place") || "נכשל בשמירת המקום"
      );
    } finally {
      setSavingPlace(false);
    }
  };

  // Handle delete place (only for business owner's own places)
  const handleDeletePlace = async () => {
    if (!selectedPlace || !userId) return;

    Alert.alert(
      t("delete_place") || "מחיקת מקום",
      `${t("delete_place_confirmation") || "האם אתה בטוח שברצונך למחוק את המקום"} "${getPlaceName(selectedPlace)}"?`,
      [
        {
          text: t("cancel") || "ביטול",
          style: "cancel",
        },
        {
          text: t("delete") || "מחק",
          style: "destructive",
          onPress: async () => {
            try {
              const res = await fetch(
                `${API_BASE_URL}/admin/places/${selectedPlace.id}`,
                {
                  method: "DELETE",
                  headers: {
                    "Content-Type": "application/json",
                  },
                }
              );

              if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.detail || "Failed to delete place");
              }

              // Refresh places list
              const data = await fetchAllPlaces();
              setPlaces(data);
              selectedPlaceIdRef.current = null;
              setSelectedPlace(null);
              Alert.alert(
                t("success") || "הצלחה",
                t("place_deleted_successfully") || "המקום נמחק בהצלחה"
              );
            } catch (error: any) {
              Alert.alert(
                t("error") || "שגיאה",
                error.message || t("failed_to_delete_place") || "נכשל במחיקת המקום"
              );
            }
          },
        },
      ]
    );
  };

  // Handle edit place (only for business owner's own places) - Navigate to ManageMyBusiness
  const handleEditPlace = () => {
    if (!selectedPlace || !userId) return;
    
    navigation.navigate("ManageMyBusiness", { fromMap: true });
  };

  // Check if the selected place belongs to the current business owner
  const isOwnPlace = selectedPlace && userId && selectedPlace.owner_user_id === userId;

  // Handle map long press (drop custom pin for destination)
  const handleMapLongPress = async (e: any) => {
    try {
      const coords = e?.geometry?.coordinates;
      if (Array.isArray(coords) && coords.length >= 2) {
        const [lon, lat] = coords;
        
        // Check boundary - destination must be within service cities
        try {
          const boundaryCheck = await checkLocationInServiceCities(lat, lon);
          if (!boundaryCheck.is_within) {
            Alert.alert(
              t("location_outside_service_area") || "Location Outside Service Area",
              t("destination_must_be_in_service_cities") || "Destination must be within one of the 3 service cities: רהט (Rahat), לקיה (Lakiya), or תל שבע (Tel Sheva).\n\nPlease choose a location within these boundaries.",
              [{ text: t("ok") || "OK" }]
            );
            return;
          }
        } catch (error: any) {
          console.error("Error checking boundary:", error);
          Alert.alert(
            t("boundary_check_error") || "Boundary Check Error",
            t("boundary_check_error_message") || "Failed to check location boundary. Please try again."
          );
          return;
        }
        
        setCustomPin({ lat, lon });
        setDestination({ lat, lon, name: `📍 ${lat.toFixed(5)}, ${lon.toFixed(5)}` });
        setSelectedPlace(null); // Clear selected place
        setSearchResults([]);
        setShowSearchModal(false);
      }
    } catch (error) {
      console.error("Error handling long press:", error);
    }
  };

  // Handle place marker tap - set as destination
  const handlePlaceTap = async (place: PlaceForMap) => {
    if (!place.location) return;
    
    selectedPlaceIdRef.current = place.id;
    setSelectedPlace(place);
    setDestination({
      lat: place.location.lat,
      lon: place.location.lon,
      name: getPlaceName(place),
    });
    setCustomPin(null);
    setSearchResults([]);
    setShowSearchModal(false);
  };

  // Search places - comprehensive search across all fields
  const handleSearch = (query: string) => {
    setSearchQuery(query);
    
    // If query is empty, clear results
    if (!query || query.trim().length === 0) {
      setSearchResults([]);
      return;
    }

    // Make sure places are loaded
    if (!places || places.length === 0) {
      console.log("No places loaded yet");
      setSearchResults([]);
      return;
    }

    try {
      const queryLower = query.toLowerCase().trim();
      
      // Filter places based on search query
      const filtered = places.filter((place) => {
        try {
          // Search in name fields (English, Arabic, Hebrew)
          const nameMatch = 
            (place.name && typeof place.name === 'string' && place.name.toLowerCase().includes(queryLower)) ||
            (place.name_ar && typeof place.name_ar === 'string' && place.name_ar.toLowerCase().includes(queryLower)) ||
            (place.name_he && typeof place.name_he === 'string' && place.name_he.toLowerCase().includes(queryLower));
          
          // Search in description
          const descriptionMatch = 
            place.description && typeof place.description === 'string' && 
            place.description.toLowerCase().includes(queryLower);
          
          // Search in city name
          const cityMatch = 
            (place.city?.name_ar && typeof place.city.name_ar === 'string' && place.city.name_ar.toLowerCase().includes(queryLower)) ||
            (place.city?.name_he && typeof place.city.name_he === 'string' && place.city.name_he.toLowerCase().includes(queryLower)) ||
            (place.city?.name_en && typeof place.city.name_en === 'string' && place.city.name_en.toLowerCase().includes(queryLower));
          
          // Search in category name
          const categoryMatch = 
            (place.category?.name_ar && typeof place.category.name_ar === 'string' && place.category.name_ar.toLowerCase().includes(queryLower)) ||
            (place.category?.name_he && typeof place.category.name_he === 'string' && place.category.name_he.toLowerCase().includes(queryLower)) ||
            (place.category?.name_en && typeof place.category.name_en === 'string' && place.category.name_en.toLowerCase().includes(queryLower));
          
          // Search in phone number (remove spaces/dashes for better matching)
          const phoneMatch = 
            place.phone && typeof place.phone === 'string' && 
            place.phone.replace(/[\s-]/g, '').includes(queryLower.replace(/[\s-]/g, ''));
          
          // Return true if any field matches
          return nameMatch || descriptionMatch || cityMatch || categoryMatch || phoneMatch;
        } catch (err) {
          console.error("Error filtering place:", err, place);
          return false;
        }
      });
      
      console.log(`Search for "${query}" found ${filtered.length} results out of ${places.length} places`);
      setSearchResults(filtered);
    } catch (error) {
      console.error("Search error:", error);
      setSearchResults([]);
    }
  };

  // Get route from user location to destination using OSRM
  const getRoute = async () => {
    const currentLanguage = i18n.language || "ar";
    
      // Check if destination is selected
    if (!destination) {
      const title = currentLanguage === "ar"
        ? "خطأ"
        : currentLanguage === "he"
        ? "שגיאה"
        : "Error";
      const message = currentLanguage === "ar"
        ? "يرجى اختيار وجهة أولاً"
        : currentLanguage === "he"
        ? "אנא בחר יעד תחילה"
        : "Please select a destination first";
      Alert.alert(title, message);
      return;
    }
    
    // Check if user location is available
    if (!userLocation) {
      const title = currentLanguage === "ar"
        ? "تفعيل الموقع مطلوب"
        : currentLanguage === "he"
        ? "נדרש הפעלת מיקום"
        : "Location Required";
      const message = currentLanguage === "ar"
        ? "لا يمكن بدء المسار بدون موقعك الحالي. يرجى تفعيل GPS والسماح للتطبيق بالوصول إلى موقعك في إعدادات الجهاز."
        : currentLanguage === "he"
        ? "לא ניתן להתחיל מסלול ללא המיקום הנוכחי שלך. אנא הפעל GPS ואפשר לאפליקציה גישה למיקום שלך בהגדרות המכשיר."
        : "Cannot start route without your current location. Please enable GPS and allow the app to access your location in device settings.";
      Alert.alert(title, message);
      
      // Try to get location again
      setLocationLoading(true);
      Geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setUserLocation({ lat: latitude, lon: longitude });
          setLocationLoading(false);
        },
        (error) => {
          console.log("GPS error when retrying:", error);
          setLocationLoading(false);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 5000,
        }
      );
      return;
    }

    setRouteLoading(true);
    
    try {
      // Using OSRM (Open Source Routing Machine) - free, no API key needed
      const profile = "driving"; // driving, walking, or cycling
      const coordinates = `${userLocation.lon},${userLocation.lat};${destination.lon},${destination.lat}`;
      
      // Using OSRM public server (free, no API key required)
      const url = `https://router.project-osrm.org/route/v1/${profile}/${coordinates}?overview=full&geometries=geojson&alternatives=false&steps=false`;
      
      console.log("Requesting route from OSRM:", url);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("OSRM API error:", response.status, errorText);
        throw new Error(`Routing service error: ${response.status} - ${errorText}`);
      }
      
      const routeData = await response.json();
      
      // OSRM response format: { code: "Ok", routes: [{ distance, duration, geometry }] }
      if (routeData.code === "Ok" && routeData.routes && routeData.routes.length > 0) {
        const route = routeData.routes[0];
        
        // Extract route information
        const distance = route.distance || 0; // in meters
        const duration = route.duration || 0; // in seconds
        
        // OSRM geometry format is already GeoJSON LineString
        const routeGeometry = route.geometry || {
          type: "LineString",
          coordinates: [
            [userLocation.lon, userLocation.lat],
            [destination.lon, destination.lat],
          ],
        };
        
        // Store route info (distance, duration)
        const routeInfoData = {
          distance,
          duration,
          startAddress: t("your_location") || "Your Location",
          endAddress: destination.name || t("destination") || "Destination",
        };

        // Store route coordinates
        const routeCoords: RouteCoordinates = {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: routeGeometry,
              properties: {},
            },
          ],
        };

        // Navigate directly to RouteDetailsScreen
        nav.navigate("RouteDetails", {
          routeInfo: routeInfoData,
          destination,
          userLocation,
          routeCoordinates: routeCoords,
        });
      } else {
        const errorMsg = routeData.code === "NoRoute" 
          ? t("no_route_found") || "No route found between these points"
          : routeData.message || t("no_route_found") || "No route found in response";
        throw new Error(errorMsg);
      }
      } catch (error: any) {
      console.error("Route error:", error?.message || String(error));
      const title = currentLanguage === "ar"
        ? "خطأ في المسار"
        : currentLanguage === "he"
        ? "שגיאת מסלול"
        : "Route Error";
      const message = error?.message || (currentLanguage === "ar"
        ? "لا يمكن الحصول على اتجاهات القيادة. يرجى المحاولة مرة أخرى."
        : currentLanguage === "he"
        ? "לא ניתן לקבל הוראות נסיעה. אנא נסה שוב."
        : "Could not get driving directions. Please try again.");
      Alert.alert(title, message);
    } finally {
      setRouteLoading(false);
    }
  };

  // Reset opening hours expanded state and translation states when place changes
  useEffect(() => {
    setOpeningHoursExpanded(false);
    setAnnouncementTranslated(null);
    setAnnouncementIsTranslated(false);
    setAnnouncementTargetLang(null);
    setDescriptionTranslated(null);
    setDescriptionIsTranslated(false);
    setDescriptionTargetLang(null);
    setShowLanguageSelector(false);
    setLanguageSelectorType(null);
  }, [selectedPlace]);

  // Open language selector for announcement
  const handleTranslateAnnouncementClick = () => {
    try {
      if (announcementIsTranslated) {
        setAnnouncementIsTranslated(false);
        return;
      }
      if (!selectedPlace?.announcement) {
        const currentLanguage = i18n.language || "ar";
        Alert.alert(
          currentLanguage === "ar" ? "خطأ" : currentLanguage === "he" ? "שגיאה" : "Error",
          currentLanguage === "ar" 
            ? "لا يوجد إعلان للترجمة"
            : currentLanguage === "he"
            ? "אין הודעה לתרגום"
            : "No announcement to translate"
        );
        return;
      }
      setLanguageSelectorType("announcement");
      setShowLanguageSelector(true);
    } catch (error) {
      console.error("Error opening language selector for announcement:", error);
    }
  };

  // Open language selector for description
  const handleTranslateDescriptionClick = () => {
    try {
      if (descriptionIsTranslated) {
        setDescriptionIsTranslated(false);
        return;
      }
      if (!selectedPlace?.description) {
        const currentLanguage = i18n.language || "ar";
        Alert.alert(
          currentLanguage === "ar" ? "خطأ" : currentLanguage === "he" ? "שגיאה" : "Error",
          currentLanguage === "ar" 
            ? "لا يوجد وصف للترجمة"
            : currentLanguage === "he"
            ? "אין תיאור לתרגום"
            : "No description to translate"
        );
        return;
      }
      setLanguageSelectorType("description");
      setShowLanguageSelector(true);
    } catch (error) {
      console.error("Error opening language selector for description:", error);
    }
  };

  // Handle language selection and translation
  const handleLanguageSelection = async (targetLang: "ar" | "he") => {
    if (!languageSelectorType) {
      setShowLanguageSelector(false);
      setLanguageSelectorType(null);
      return;
    }
    
    setShowLanguageSelector(false);
    
    const currentLanguage = i18n.language || "ar";
    
    if (languageSelectorType === "announcement") {
      if (!selectedPlace?.announcement) {
        Alert.alert(
          currentLanguage === "ar" ? "خطأ" : currentLanguage === "he" ? "שגיאה" : "Error",
          currentLanguage === "ar" 
            ? "لا يوجد إعلان للترجمة"
            : currentLanguage === "he"
            ? "אין הודעה לתרגום"
            : "No announcement to translate"
        );
        setLanguageSelectorType(null);
        return;
      }
      
      if (announcementTranslated && announcementTargetLang === targetLang) {
        setAnnouncementIsTranslated(true);
        setLanguageSelectorType(null);
        return;
      }

      setAnnouncementTranslating(true);
      try {
        const result = await translateText(selectedPlace.announcement, targetLang);
        if (result && result.translated_text) {
          setAnnouncementTranslated(result.translated_text);
          setAnnouncementTargetLang(targetLang);
          setAnnouncementIsTranslated(true);
        } else {
          throw new Error("Translation returned no result");
        }
      } catch (error: any) {
        console.error("Translation error:", error);
        const errorTitle = currentLanguage === "ar" ? "خطأ" : currentLanguage === "he" ? "שגיאה" : "Error";
        const errorMessage = error?.message || (currentLanguage === "ar"
          ? "فشل الترجمة. يرجى التأكد من أن الخادم يعمل والمحاولة مرة أخرى."
          : currentLanguage === "he"
          ? "התרגום נכשל. אנא ודא שהשרת רץ ונסה שוב."
          : "Translation failed. Please make sure the server is running and try again.");
        Alert.alert(errorTitle, errorMessage);
        setAnnouncementIsTranslated(false);
        setAnnouncementTranslated(null);
        setAnnouncementTargetLang(null);
      } finally {
        setAnnouncementTranslating(false);
        setLanguageSelectorType(null);
      }
    } else if (languageSelectorType === "description") {
      if (!selectedPlace?.description) {
        Alert.alert(
          currentLanguage === "ar" ? "خطأ" : currentLanguage === "he" ? "שגיאה" : "Error",
          currentLanguage === "ar" 
            ? "لا يوجد وصف للترجمة"
            : currentLanguage === "he"
            ? "אין תיאור לתרגום"
            : "No description to translate"
        );
        setLanguageSelectorType(null);
        return;
      }
      
      if (descriptionTranslated && descriptionTargetLang === targetLang) {
        setDescriptionIsTranslated(true);
        setLanguageSelectorType(null);
        return;
      }

      setDescriptionTranslating(true);
      try {
        const result = await translateText(selectedPlace.description, targetLang);
        if (result && result.translated_text) {
          setDescriptionTranslated(result.translated_text);
          setDescriptionTargetLang(targetLang);
          setDescriptionIsTranslated(true);
        } else {
          throw new Error("Translation returned no result");
        }
      } catch (error: any) {
        console.error("Translation error:", error);
        const errorTitle = currentLanguage === "ar" ? "خطأ" : currentLanguage === "he" ? "שגיאה" : "Error";
        const errorMessage = error?.message || (currentLanguage === "ar"
          ? "فشل الترجمة. يرجى التأكد من أن الخادم يعمل والمحاولة مرة أخرى."
          : currentLanguage === "he"
          ? "התרגום נכשל. אנא ודא שהשרת רץ ונסה שוב."
          : "Translation failed. Please make sure the server is running and try again.");
        Alert.alert(errorTitle, errorMessage);
        setDescriptionIsTranslated(false);
        setDescriptionTranslated(null);
        setDescriptionTargetLang(null);
      } finally {
        setDescriptionTranslating(false);
        setLanguageSelectorType(null);
      }
    } else {
      setLanguageSelectorType(null);
    }
  };

  // Bottom sheet animation values
  const translateY = useSharedValue(SCREEN_HEIGHT);

  // Reset bottom sheet position and scroll when place is selected/deselected
  useEffect(() => {
    if (selectedPlace) {
      // Position above tab bar with additional offset
      const targetY = SCREEN_HEIGHT - BOTTOM_TAB_HEIGHT - BOTTOM_SHEET_MIN_HEIGHT - BOTTOM_SHEET_OFFSET;
      translateY.value = withSpring(targetY, {
        damping: 20,
        stiffness: 90,
      });
      // Reset scroll position to top when place changes
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({ y: 0, animated: true });
      }, 100);
    } else {
      // Hide below screen (accounting for tab bar and offset)
      translateY.value = withTiming(SCREEN_HEIGHT - BOTTOM_TAB_HEIGHT - BOTTOM_SHEET_OFFSET, {
        duration: 300,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlace]);

  // Pan responder for bottom sheet drag
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only respond to vertical drags
        return Math.abs(gestureState.dy) > 5 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },
      onPanResponderGrant: () => {
        // Start dragging
      },
      onPanResponderMove: (_, gestureState) => {
        // Calculate new position based on drag
        const currentTranslateY = translateY.value;
        const newTranslateY = currentTranslateY + gestureState.dy;
        
        // Clamp to min/max positions (accounting for tab bar and offset)
        const minY = SCREEN_HEIGHT - BOTTOM_TAB_HEIGHT - BOTTOM_SHEET_MAX_HEIGHT - BOTTOM_SHEET_OFFSET;
        const maxY = SCREEN_HEIGHT - BOTTOM_TAB_HEIGHT - BOTTOM_SHEET_MIN_HEIGHT - BOTTOM_SHEET_OFFSET;
        const clampedY = Math.max(minY, Math.min(maxY, newTranslateY));
        
        translateY.value = clampedY;
      },
      onPanResponderRelease: (_, gestureState) => {
        const velocity = gestureState.vy;
        const currentTranslateY = translateY.value;
        const currentHeight = SCREEN_HEIGHT - currentTranslateY;
        
        // Determine target height based on position and velocity
        let targetHeight = BOTTOM_SHEET_MIN_HEIGHT;
        
        if (velocity < -0.5 || (currentHeight > SCREEN_HEIGHT * 0.4 && velocity < 0)) {
          // Swipe up - expand to max
          targetHeight = BOTTOM_SHEET_MAX_HEIGHT;
        } else if (velocity > 0.5 || currentHeight < SCREEN_HEIGHT * 0.3) {
          // Swipe down - collapse to min
          targetHeight = BOTTOM_SHEET_MIN_HEIGHT;
        } else {
          // Stay at current position (snap to nearest)
          if (currentHeight > (BOTTOM_SHEET_MIN_HEIGHT + BOTTOM_SHEET_MAX_HEIGHT) / 2) {
            targetHeight = BOTTOM_SHEET_MAX_HEIGHT;
          } else {
            targetHeight = BOTTOM_SHEET_MIN_HEIGHT;
          }
        }
        
        const targetY = SCREEN_HEIGHT - BOTTOM_TAB_HEIGHT - targetHeight - BOTTOM_SHEET_OFFSET;
        translateY.value = withSpring(targetY, {
          damping: 20,
          stiffness: 90,
        });
      },
    })
  ).current;

  // Animated styles for bottom sheet
  const bottomSheetAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
    };
  });

  const onRegionDidChange = async (feature: any) => {
    const [lon, lat] = feature.geometry.coordinates;
    const newZoom = feature.properties.zoomLevel;
    setCurrentZoom(newZoom);

    if (lon < 34.72 || lat > 31.43) {
      cameraRef.current?.setCamera({
        centerCoordinate: [34.75, 31.39],
        animationDuration: 600,
      });
    }
  };

  const resetCamera = () => {
    cameraRef.current?.setCamera({
      centerCoordinate: INITIAL_CENTER,
      zoomLevel: INITIAL_ZOOM,
      animationDuration: 1000,
    });
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <TouchableOpacity
          style={styles.searchInputTouchable}
          onPress={() => setShowSearchModal(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="search-outline" size={20} color="#666" style={styles.searchIcon} />
          <Text style={styles.searchInputPlaceholder}>
            {searchQuery || (t("search_places") || "Search places...")}
          </Text>
        </TouchableOpacity>
        {locationLoading && (
          <ActivityIndicator size="small" color="#0f5b63" style={styles.loader} />
        )}
      </View>

      {/* Search Results Modal */}
      <Modal
        visible={showSearchModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSearchModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t("search_places") || "Search Places"}</Text>
              <TouchableOpacity onPress={() => {
                setShowSearchModal(false);
                setSearchQuery("");
              }}>
                <Text style={styles.modalCloseButton}>✕</Text>
              </TouchableOpacity>
            </View>
            {/* Search Input Inside Modal */}
            <View style={styles.modalSearchContainer}>
              <TextInput
                style={styles.modalSearchInput}
                placeholder={t("search_places") || "Search places..."}
                placeholderTextColor="#666"
                value={searchQuery}
                onChangeText={handleSearch}
                autoFocus={true}
              />
              <Ionicons name="search-outline" size={20} color="#666" style={styles.modalSearchIcon} />
            </View>
            <ScrollView style={styles.searchResultsList} keyboardShouldPersistTaps="handled">
              {searchQuery.trim().length === 0 && (
                <Text style={styles.noResults}>{t("start_typing_to_search") || "Start typing to search places..."}</Text>
              )}
              {searchResults.length === 0 && searchQuery.trim().length > 0 && (
                <Text style={styles.noResults}>{t("no_places_found") || "No places found"}</Text>
              )}
              {searchResults.map((place) => (
                <TouchableOpacity
                  key={place.id}
                  style={styles.searchResultItem}
                  onPress={() => {
                    handlePlaceTap(place);
                    setSearchQuery("");
                    setShowSearchModal(false);
                  }}
                >
                  <Text style={styles.searchResultName}>{getPlaceName(place)}</Text>
                  <View style={styles.searchResultDetails}>
                    {getCityName(place.city) && (
                      <Text style={styles.searchResultCity}>{getCityName(place.city)}</Text>
                    )}
                    {place.category && (
                      <>
                        {getCityName(place.city) && <Text style={styles.searchResultSeparator}> • </Text>}
                        <Text style={styles.searchResultCategory}>
                          {i18n.language === "he" && place.category.name_he
                            ? place.category.name_he
                            : i18n.language === "ar" && place.category.name_ar
                            ? place.category.name_ar
                            : place.category.name_ar || place.category.name_he || ""}
                        </Text>
                      </>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <MapView
        style={styles.map}
        mapStyle={MAP_STYLE_URL}
        onRegionDidChange={onRegionDidChange}
        onLongPress={handleMapLongPress}
        onPress={(e: any) => {
          // Handle regular tap - check if tapping near a place
          try {
            const coords = e?.geometry?.coordinates;
            if (Array.isArray(coords) && coords.length >= 2) {
              const [lon, lat] = coords;
              // Find nearest place within reasonable distance
              const nearestPlace = places.find((place) => {
                if (!place.location) return false;
                const distance = Math.sqrt(
                  Math.pow(place.location.lon - lon, 2) + Math.pow(place.location.lat - lat, 2)
                );
                return distance < 0.001; // ~100 meters
              });
              if (nearestPlace) {
                handlePlaceTap(nearestPlace);
              }
            }
          } catch {
            // Ignore tap errors
          }
        }}
        scrollEnabled={true}
        rotateEnabled={false}
        pitchEnabled={false}
        logoEnabled={false}
        attributionEnabled={false}
        onDidFailLoadingMap={() => {
          // Log error but don't show to user - map might still work
          // These timeout errors are usually non-critical and the map still functions
          if (__DEV__) {
            console.log("Map loading warning (non-critical) - map may still work");
          }
        }}
      >
        <Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: INITIAL_CENTER,
            zoomLevel: INITIAL_ZOOM,
          }}
          maxBounds={NEGEV_BOUNDS}
          minZoomLevel={10}
          maxZoomLevel={18}
          animationMode="flyTo"
        />

        {/* User Location Marker */}
        {userLocation && (
          <PointAnnotation id="user_location" coordinate={[userLocation.lon, userLocation.lat]}>
            <View style={styles.userLocationMarker}>
              <View style={styles.userLocationDot} />
            </View>
          </PointAnnotation>
        )}

        {/* Custom Pin Marker (destination from map tap) */}
        {customPin && (
          <PointAnnotation id="custom_pin" coordinate={[customPin.lon, customPin.lat]}>
            <View style={styles.customPinMarker}>
              <View style={styles.customPinDot} />
            </View>
          </PointAnnotation>
        )}

        {/* Destination Marker (from place selection) */}
        {destination && !customPin && (
          <PointAnnotation id="destination" coordinate={[destination.lon, destination.lat]}>
            <View style={styles.destinationMarker}>
              <Text style={styles.destinationMarkerText}>📍</Text>
            </View>
          </PointAnnotation>
        )}

        {places.map((place) => {
          if (!place.location) return null;
          
          const isSelected = selectedPlace?.id === place.id;
          const placeIcon = getPlaceIcon(place);
          
          // Determine visibility based on zoom level and place type
          let shouldShow = false;
          let shouldShowLabel = false;
          
          if (place.place_type === 'PUBLIC_SERVICE') {
            shouldShow = currentZoom >= PUBLIC_SERVICE_ZOOM_THRESHOLD || isSelected;
            shouldShowLabel = currentZoom >= PUBLIC_SERVICE_ZOOM_THRESHOLD || isSelected;
          } else if (place.place_type === 'BUSINESS') {
            shouldShow = currentZoom >= BUSINESS_ZOOM_THRESHOLD || isSelected;
            shouldShowLabel = currentZoom >= BUSINESS_ZOOM_THRESHOLD || isSelected;
          }
          
          if (!shouldShow) return null;

          return (
            <PointAnnotation
              key={place.id}
              id={String(place.id)}
              coordinate={[place.location.lon, place.location.lat]}
              onSelected={() => {
                console.log("Place selected:", place.id, place.name);
                handlePlaceTap(place);
              }}
            >
              <View style={styles.nativeMarkerContainer}>
                {/* Icon/Marker based on place type - Google Maps style */}
                {place.place_type === 'PUBLIC_SERVICE' ? (
                  <View style={[styles.publicServiceMarker, isSelected && styles.markerSelected]}>
                    {/* Pin container with shadow - צל חזק יותר אם נבחר */}
                    <View style={[styles.pinContainer, isSelected && styles.pinContainerSelected]}>
                      {/* Icon circle - גדול יותר אם נבחר */}
                      <View style={[
                        styles.iconContainer, 
                        isSelected && styles.iconContainerSelected,
                        { backgroundColor: placeIcon.color }
                      ]}>
                        {placeIcon.type === 'mosque' && (
                          <MaterialCommunityIcons name="mosque" size={isSelected ? 26 : 18} color="#FFFFFF" />
                        )}
                        {placeIcon.type === 'school' && (
                          <Ionicons name="school" size={isSelected ? 26 : 18} color="#FFFFFF" />
                        )}
                        {placeIcon.type === 'clinic' && (
                          <MaterialCommunityIcons name="hospital-building" size={isSelected ? 26 : 18} color="#FFFFFF" />
                        )}
                        {placeIcon.type === 'kindergarten' && (
                          <MaterialCommunityIcons name="baby-face-outline" size={isSelected ? 26 : 18} color="#FFFFFF" />
                        )}
                        {placeIcon.type === 'community' && (
                          <MaterialCommunityIcons name="account-group" size={isSelected ? 26 : 18} color="#FFFFFF" />
                        )}
                        {placeIcon.type === 'home' && (
                          <Ionicons name="home" size={isSelected ? 26 : 18} color="#FFFFFF" />
                        )}
                        {placeIcon.type === 'public' && (
                          <Ionicons name="location" size={isSelected ? 26 : 18} color="#FFFFFF" />
                        )}
                      </View>
                      {/* Pin point (triangle pointing down) - גדול יותר אם נבחר */}
                      <View style={[
                        styles.pinPoint, 
                        isSelected && styles.pinPointSelected,
                        { borderTopColor: placeIcon.color }
                      ]} />
                    </View>
                  </View>
                ) : (
                  <View style={[styles.businessMarker, isSelected && styles.markerSelected]}>
                    {/* Pin container with shadow - צל חזק יותר אם נבחר */}
                    <View style={[styles.pinContainer, isSelected && styles.pinContainerSelected]}>
                      {/* Icon circle - גדול יותר אם נבחר */}
                      <View style={[
                        styles.iconContainer, 
                        isSelected && styles.iconContainerSelected,
                        { backgroundColor: placeIcon.color }
                      ]}>
                        <Ionicons name="business" size={isSelected ? 24 : 16} color="#FFFFFF" />
                      </View>
                      {/* Pin point (triangle pointing down) - גדול יותר אם נבחר */}
                      <View style={[
                        styles.pinPoint, 
                        isSelected && styles.pinPointSelected,
                        { borderTopColor: placeIcon.color }
                      ]} />
                    </View>
                </View>
                )}

                {/* Label with icon - Google Maps style */}
                {shouldShowLabel && (
                  <View style={[styles.labelWrapper, isSelected && styles.labelSelected]}>
                    <View style={styles.labelContent}>
                      {/* Small icon next to text */}
                      <View style={[styles.labelIconContainer, { backgroundColor: placeIcon.color }]}>
                        {place.place_type === 'PUBLIC_SERVICE' && (
                          <>
                            {placeIcon.type === 'mosque' && (
                              <MaterialCommunityIcons name="mosque" size={12} color="#FFFFFF" />
                            )}
                            {placeIcon.type === 'school' && (
                              <Ionicons name="school" size={12} color="#FFFFFF" />
                            )}
                            {placeIcon.type === 'clinic' && (
                              <MaterialCommunityIcons name="hospital-building" size={12} color="#FFFFFF" />
                            )}
                            {placeIcon.type === 'kindergarten' && (
                              <MaterialCommunityIcons name="baby-face-outline" size={12} color="#FFFFFF" />
                            )}
                            {placeIcon.type === 'community' && (
                              <MaterialCommunityIcons name="account-group" size={12} color="#FFFFFF" />
                            )}
                            {placeIcon.type === 'home' && (
                              <Ionicons name="home" size={12} color="#FFFFFF" />
                            )}
                            {placeIcon.type === 'public' && (
                              <Ionicons name="location" size={12} color="#FFFFFF" />
                            )}
                          </>
                        )}
                        {place.place_type === 'BUSINESS' && (
                          <Ionicons name="business" size={12} color="#FFFFFF" />
                        )}
                      </View>
                    <Text style={styles.nativeMapLabel} numberOfLines={1}>
                        {getPlaceName(place)}
                    </Text>
                    </View>
                  </View>
                )}
              </View>
            </PointAnnotation>
          );
        })}
      </MapView>

      {!selectedPlace && !destination && (
        <TouchableOpacity style={styles.recenterButton} onPress={resetCamera}>
          <Text style={styles.recenterButtonText}>🎯</Text>
        </TouchableOpacity>
      )}

      {/* Selected Place Bottom Sheet */}
      {selectedPlace && (
        <Animated.View 
          style={[styles.bottomSheetContainer, bottomSheetAnimatedStyle]}
          pointerEvents="auto"
        >
          <>
            {/* Drag Handle */}
            <View 
              style={styles.dragHandleArea}
              {...panResponder.panHandlers}
            >
              <View style={styles.dragHandle} />
            </View>

            <ScrollView 
              ref={scrollViewRef}
              style={styles.bottomSheetScrollView}
              contentContainerStyle={styles.bottomSheetContent}
              showsVerticalScrollIndicator={true}
            >
            {/* Header with close button */}
            <View style={styles.bottomSheetHeader}>
              <View style={styles.bottomSheetHeaderLeft}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => {
                selectedPlaceIdRef.current = null;
                setSelectedPlace(null);
              }}
            >
                  <Ionicons name="close" size={24} color="#000" />
            </TouchableOpacity>
          </View>
              <View style={styles.bottomSheetHeaderRight}>
                <TouchableOpacity style={styles.headerIconButton}>
                  <Ionicons name="share-outline" size={24} color="#000" />
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.headerIconButton}
                  onPress={handleToggleSave}
                  disabled={savingPlace || !userId}
                >
                  <Ionicons 
                    name={isPlaceSaved ? "bookmark" : "bookmark-outline"} 
                    size={24} 
                    color={isPlaceSaved ? "#0f5b63" : "#000"} 
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Title and Subtitle */}
            <View style={styles.bottomSheetTitleSection}>
              <Text style={styles.bottomSheetTitle} numberOfLines={2}>
                {getPlaceName(selectedPlace)}
              </Text>
              <View style={styles.bottomSheetSubtitleRow}>
                {/* Category (for businesses) or Public Service type */}
                {selectedPlace.place_type === "BUSINESS" && selectedPlace.category ? (
                  <Text style={styles.bottomSheetSubtitle}>
                    {getCategoryName(selectedPlace.category)}
                  </Text>
                ) : (
                  <Text style={styles.bottomSheetSubtitle}>
                    {t("public") || (i18n.language === "ar" ? "عام" : "ציבורי")}
                  </Text>
                )}
                {getCityName(selectedPlace.city) && (
                  <>
                    <Text style={styles.subtitleSeparator}> • </Text>
                    <Text style={styles.bottomSheetSubtitle}>
                      {getCityName(selectedPlace.city)}
                    </Text>
                  </>
                )}
              </View>
              
              {/* Description */}
              {selectedPlace.description && (
                <View style={styles.descriptionSectionInline}>
                  <View style={styles.descriptionHeader}>
                    <Text style={styles.descriptionTitleInline}>
                      {t("description") || "תיאור"}
                    </Text>
                    <View style={styles.translateButtonContainer}>
                      {descriptionIsTranslated && (
                        <TouchableOpacity
                          onPress={() => setDescriptionIsTranslated(false)}
                          style={styles.showOriginalButton}
                        >
                          <Text style={styles.showOriginalButtonText}>
                            {i18n.language === "ar" ? "عرض الأصل" : "הצג מקור"}
                          </Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        onPress={handleTranslateDescriptionClick}
                        disabled={descriptionTranslating}
                        style={styles.translateIconButton}
                      >
                        {descriptionTranslating ? (
                          <ActivityIndicator size="small" color="#0f5b63" />
                        ) : (
                          <Ionicons name="language-outline" size={20} color="#0f5b63" />
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                  <Text style={styles.descriptionTextInline}>
                    {descriptionIsTranslated && descriptionTranslated
                      ? descriptionTranslated
                      : selectedPlace.description}
                  </Text>
                </View>
              )}

              {/* Open/Closed Status (for all businesses) */}
              {selectedPlace.place_type === "BUSINESS" && (
                <View style={styles.statusRow}>
                  {selectedPlace.opening_hours ? (
                    <View style={[
                      styles.statusBadge,
                      isBusinessCurrentlyOpen(selectedPlace.opening_hours) 
                        ? styles.statusBadgeOpen 
                        : styles.statusBadgeClosed
                    ]}>
                      <Text style={[
                        styles.statusText,
                        isBusinessCurrentlyOpen(selectedPlace.opening_hours) 
                          ? styles.statusTextOpen 
                          : styles.statusTextClosed
                      ]}>
                        {isBusinessCurrentlyOpen(selectedPlace.opening_hours) 
                          ? (t("open") || (i18n.language === "ar" ? "مفتوح" : "פתוח"))
                          : (t("closed") || (i18n.language === "ar" ? "مغلق" : "סגור"))}
                      </Text>
                    </View>
                  ) : (
                    <View style={[styles.statusBadge, styles.statusBadgeClosed]}>
                      <Text style={[styles.statusText, styles.statusTextClosed]}>
                        {t("closed") || (i18n.language === "ar" ? "مغلق" : "סגור")}
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>

            {/* Action Buttons Row */}
            <View style={styles.actionButtonsRow}>
              <TouchableOpacity style={styles.actionButtonSecondary}>
                <Ionicons name="share-outline" size={20} color="#0f5b63" />
                <Text style={styles.actionButtonSecondaryText}>
                  {t("share") || "שיתוף"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.actionButtonSecondary}
                onPress={handleToggleSave}
                disabled={savingPlace || !userId}
              >
                <Ionicons 
                  name={isPlaceSaved ? "bookmark" : "bookmark-outline"} 
                  size={20} 
                  color={isPlaceSaved ? "#0f5b63" : "#0f5b63"} 
                />
                <Text style={styles.actionButtonSecondaryText}>
                  {isPlaceSaved ? (t("saved") || "שמור") : (t("save") || "שמירה")}
                </Text>
              </TouchableOpacity>
              
              {/* Get Directions Button - Navigates directly to RouteDetailsScreen */}
              {destination && (
                <TouchableOpacity
                  style={styles.actionButtonPrimary}
                  onPress={getRoute}
                  disabled={routeLoading || !userLocation}
                >
                  {routeLoading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="navigate-outline" size={20} color="#FFFFFF" />
                      <Text style={styles.actionButtonPrimaryText}>
                        {t("get_directions") || "Get Directions"}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              {!destination && (
                <TouchableOpacity
                  style={styles.actionButtonPrimary}
                  onPress={() => {
                    if (selectedPlace && selectedPlace.location) {
                      handlePlaceTap(selectedPlace);
                    }
                  }}
                >
                  <Ionicons name="map-outline" size={20} color="#FFFFFF" />
                  <Text style={styles.actionButtonPrimaryText}>
                    {t("set_destination") || "Set Destination"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Announcement Banner */}
            {selectedPlace.announcement && (
              <View style={styles.announcementBanner}>
                <View style={styles.announcementHeader}>
                  <Ionicons name="megaphone-outline" size={20} color="#0f5b63" />
                  <Text style={styles.announcementTitle}>
                    {i18n.language === "ar" 
                      ? "أخبار مهمة من المالك" 
                      : i18n.language === "he"
                      ? "חדשות חשובות מהבעלים"
                      : "Important News from Owner"}
                  </Text>
                  <View style={styles.translateButtonContainer}>
                    {announcementIsTranslated && (
                      <TouchableOpacity
                        onPress={() => setAnnouncementIsTranslated(false)}
                        style={styles.showOriginalButton}
                      >
                        <Text style={styles.showOriginalButtonText}>
                          {i18n.language === "ar" ? "عرض الأصل" : "הצג מקור"}
                        </Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      onPress={handleTranslateAnnouncementClick}
                      disabled={announcementTranslating}
                      style={styles.translateIconButton}
                    >
                      {announcementTranslating ? (
                        <ActivityIndicator size="small" color="#0f5b63" />
                      ) : (
                        <Ionicons name="language-outline" size={20} color="#0f5b63" />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
                <Text style={styles.announcementText}>
                  {announcementIsTranslated && announcementTranslated
                    ? announcementTranslated
                    : selectedPlace.announcement}
                </Text>
              </View>
            )}

            {/* Image Gallery - Horizontal Scroll */}
            {(() => {
              const allImages = collectBusinessImageUrls(
                selectedPlace.business_images_urls,
                selectedPlace.main_image_url
              );
              logPlaceImageRenderDebug(
                "BusinessOwnerHome:sheet",
                selectedPlace,
                allImages
              );

              if (allImages.length > 0) {
                return (
                  <View style={styles.imageGalleryContainer}>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={true}
                      contentContainerStyle={styles.imageScrollContent}
                      style={styles.imageScrollView}
                    >
                      {allImages.map((imageUri, index) => {
                        const uri = formatApiImageUri(imageUri);
                        if (!uri) return null;
                        return (
                          <TouchableOpacity
                            key={index}
                            onPress={() => {
                              setSelectedPhotoIndex(index);
                              setPhotoModalVisible(true);
                              setTimeout(() => {
                                photoScrollViewRef.current?.scrollTo({
                                  x: index * SCREEN_WIDTH,
                                  animated: false,
                                });
                              }, 100);
                            }}
                            style={styles.imageGridItem}
                          >
                            <Image
                              source={{ uri }}
                              style={styles.gridImage}
                              resizeMode="cover"
                            />
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                );
              }
              return (
                <View style={styles.imageGalleryContainer}>
                  <View style={[styles.gridImage, styles.noImagePlaceholder, { alignItems: "center", justifyContent: "center", backgroundColor: "#E8E8ED" }]}>
                    <Ionicons name="image-outline" size={40} color="#8E8E93" />
                  </View>
                </View>
              );
            })()}

            {/* Details Section - Card Style */}
            <View style={styles.detailsSection}>
              {/* Opening Hours Card - Expandable */}
              {selectedPlace.place_type === "BUSINESS" && selectedPlace.opening_hours && (
                <TouchableOpacity
                  style={styles.detailCard}
                  onPress={() => setOpeningHoursExpanded(!openingHoursExpanded)}
                  activeOpacity={0.7}
                >
                  <View style={styles.detailCardContent}>
                    <Ionicons name="time-outline" size={20} color="#000" />
                    <View style={styles.detailCardTextContainer}>
                      <Text style={[
                        styles.detailCardStatus,
                        !isBusinessCurrentlyOpen(selectedPlace.opening_hours) && styles.detailCardStatusClosed
                      ]}>
                        {isBusinessCurrentlyOpen(selectedPlace.opening_hours) 
                          ? (i18n.language === "ar" ? "مفتوح" : "פתוח")
                          : getOpeningHoursStatus(selectedPlace.opening_hours)}
                      </Text>
                    </View>
                    <Ionicons 
                      name={openingHoursExpanded ? "chevron-up" : "chevron-down"} 
                      size={20} 
                      color="#666" 
                    />
                  </View>
                  {openingHoursExpanded && (
                    <View style={styles.openingHoursTable}>
                      {parseOpeningHours(selectedPlace.opening_hours).map((dayInfo, index) => (
                        <View 
                          key={index} 
                          style={[
                            styles.openingHoursRow,
                            dayInfo.isToday && styles.openingHoursRowToday
                          ]}
                        >
                          <Text style={[
                            styles.openingHoursDay,
                            dayInfo.isToday && styles.openingHoursDayToday
                          ]}>
                            {dayInfo.day}
                          </Text>
                          <Text style={[
                            styles.openingHoursTime,
                            !dayInfo.hours && styles.openingHoursClosed
                          ]}>
                            {dayInfo.hours || (i18n.language === "ar" ? "مغلق" : "סגור")}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </TouchableOpacity>
              )}

              {/* Location Card */}
              <View style={styles.detailCard}>
                <View style={styles.detailCardContent}>
                  <Ionicons name="location-outline" size={20} color="#000" />
                  <View style={styles.detailCardTextContainer}>
                    <Text style={styles.detailCardText}>
                      {getCityName(selectedPlace.city) || t("no_data") || "אין נתונים"}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Category Card */}
              {selectedPlace.category && (
                <View style={styles.detailCard}>
                  <View style={styles.detailCardContent}>
                    <MaterialCommunityIcons 
                      name={selectedPlace.category?.icon_name as any || "tag"} 
                      size={20} 
                      color="#000" 
                    />
                    <View style={styles.detailCardTextContainer}>
                      <Text style={styles.detailCardText}>
                        {selectedPlace.category
                          ? (i18n.language === "he" && selectedPlace.category.name_he
                              ? selectedPlace.category.name_he
                              : i18n.language === "ar" && selectedPlace.category.name_ar
                              ? selectedPlace.category.name_ar
                              : selectedPlace.category.name_ar || selectedPlace.category.name_he || "")
                          : (t("no_data") || "אין נתונים")}
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Phone Card */}
              <View style={styles.detailCard}>
                <View style={styles.detailCardContent}>
                  <Ionicons name="call-outline" size={20} color="#000" />
                  <View style={styles.detailCardTextContainer}>
                    <Text style={[styles.detailCardText, !selectedPlace.phone && styles.noDataText]}>
                      {selectedPlace.phone || (t("no_data") || "אין נתונים")}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Social Links Card */}
              {selectedPlace.social_links ? (
                <TouchableOpacity
                  style={styles.detailCard}
                  onPress={() => {
                    const url = selectedPlace.social_links!.startsWith('http') 
                      ? selectedPlace.social_links! 
                      : `https://${selectedPlace.social_links}`;
                    Linking.openURL(url).catch(_err => {
                      Alert.alert(t("error") || "Error", t("could_not_open_link") || "Could not open link");
                    });
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.detailCardContent}>
                    <Ionicons name="link-outline" size={20} color="#000" />
                    <View style={styles.detailCardTextContainer}>
                      <Text style={[styles.detailCardText, styles.socialLinkText]} numberOfLines={1}>
                        {selectedPlace.social_links}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#666" />
                  </View>
                </TouchableOpacity>
              ) : (
                <View style={styles.detailCard}>
                  <View style={styles.detailCardContent}>
                    <Ionicons name="link-outline" size={20} color="#000" />
                    <View style={styles.detailCardTextContainer}>
                      <Text style={[styles.detailCardText, styles.noDataText]}>
                        {t("no_data") || "אין נתונים"}
                      </Text>
                    </View>
                  </View>
                </View>
              )}
            </View>

            {/* Business Owner Actions - Only for own places */}
            {isOwnPlace && (
              <View style={styles.adminActionsSection}>
                <TouchableOpacity style={styles.editButton} onPress={handleEditPlace}>
                  <Ionicons name="create-outline" size={20} color="#FFFFFF" />
                  <Text style={styles.editButtonText}>
                    {i18n.language === "ar" ? "تعديل معلومات عملي" : "ערוך את פרטי העסק שלי"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={handleDeletePlace}
                >
                  <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
                  <Text style={styles.deleteButtonText}>
                    {t("delete_place") || "מחק מקום"}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
            </ScrollView>
          </>
        </Animated.View>
      )}

      {/* Language Selector Modal */}
      <Modal
        visible={showLanguageSelector}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setShowLanguageSelector(false);
          setLanguageSelectorType(null);
        }}
      >
        <View style={styles.languageSelectorModalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => {
              setShowLanguageSelector(false);
              setLanguageSelectorType(null);
            }}
          />
          <View style={styles.languageSelectorModal}>
            <Text style={styles.languageSelectorTitle}>
              {i18n.language === "ar" ? "اختر اللغة" : i18n.language === "he" ? "בחר שפה" : "Select Language"}
            </Text>
            <Text style={styles.languageSelectorSubtitle}>
              {i18n.language === "ar" 
                ? "اختر اللغة التي تريد الترجمة إليها"
                : i18n.language === "he"
                ? "בחר את השפה שאליה תרצה לתרגם"
                : "Select the language you want to translate to"}
            </Text>
            <TouchableOpacity
              style={styles.languageOption}
              onPress={() => {
                if (languageSelectorType) {
                  handleLanguageSelection("he");
                }
              }}
              disabled={!languageSelectorType}
            >
              <Text style={styles.languageOptionText}>עברית</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.languageOption}
              onPress={() => {
                if (languageSelectorType) {
                  handleLanguageSelection("ar");
                }
              }}
              disabled={!languageSelectorType}
            >
              <Text style={styles.languageOptionText}>العربية</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.languageSelectorCancel}
              onPress={() => {
                setShowLanguageSelector(false);
                setLanguageSelectorType(null);
              }}
            >
              <Text style={styles.languageSelectorCancelText}>
                {i18n.language === "ar" ? "إلغاء" : i18n.language === "he" ? "ביטול" : "Cancel"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Photo Gallery Full Screen Modal */}
      {selectedPlace && (() => {
        const allImages = collectBusinessImageUrls(
          selectedPlace.business_images_urls,
          selectedPlace.main_image_url
        );
        logPlaceImageRenderDebug(
          "BusinessOwnerHome:photoModal",
          selectedPlace,
          allImages
        );

        if (allImages.length === 0) return null;

        return (
          <Modal
            visible={photoModalVisible}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setPhotoModalVisible(false)}
          >
            <View style={styles.photoModalContainer}>
              <TouchableOpacity
                style={styles.photoModalCloseButton}
                onPress={() => setPhotoModalVisible(false)}
              >
                <Ionicons name="close" size={32} color="#fff" />
              </TouchableOpacity>
              <ScrollView
                ref={photoScrollViewRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(event) => {
                  const newIndex = Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH);
                  setSelectedPhotoIndex(newIndex);
                }}
                style={styles.photoModalScrollView}
              >
                {allImages.map((imageUri, index) => {
                  const uri = formatApiImageUri(imageUri);
                  if (!uri) return null;
                  return (
                    <View key={index} style={styles.photoModalImageContainer}>
                      <Image
                        source={{ uri }}
                        style={styles.photoModalImage}
                        resizeMode="contain"
                      />
                    </View>
                  );
                })}
              </ScrollView>
              {/* Photo counter */}
              <View style={styles.photoCounter}>
                <Text style={styles.photoCounterText}>
                  {selectedPhotoIndex + 1} / {allImages.length}
                </Text>
              </View>
            </View>
          </Modal>
        );
      })()}

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F2F2F7" },
  map: { flex: 1 },

  // מרקר בסגנון גוגל מפות
  nativeMarkerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible', // חשוב כדי שהטקסט לא ייחתך
  },
  
  // מרקר למקומות ציבוריים (מסגד, בית ספר, קופת חולים)
  publicServiceMarker: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  
  // מרקר לעסקים
  businessMarker: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  
  // מיכל הפין המלא (עם הצל)
  pinContainer: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  
  // מיכל הפין למקום נבחר - צל חזק יותר
  pinContainerSelected: {
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },
  
  // מיכל האייקון (הצורה העגולה עם האייקון) - בסגנון Google Maps
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#4285F4',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    zIndex: 2,
  },
  
  // מיכל האייקון למקום נבחר - גדול יותר ובולט יותר
  iconContainerSelected: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 4,
    zIndex: 3,
  },
  
  // הנקודה התחתונה (הפין - משולש מצביע למטה) - בסגנון Google Maps
  pinPoint: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#4285F4',
    marginTop: -3,
    zIndex: 1,
    // Shadow for the pin point
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  
  // הפין למקום נבחר - גדול יותר
  pinPointSelected: {
    borderLeftWidth: 12,
    borderRightWidth: 12,
    borderTopWidth: 18,
    marginTop: -4,
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  
  markerSelected: {
    transform: [{ scale: 1.0 }], // לא משנה את הגודל הכללי, רק את האייקון והפין
  },

  // מעטפת לטקסט (בסגנון Google Maps)
  labelWrapper: {
    marginTop: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.12)',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
    zIndex: 1,
    maxWidth: 140,
  },
  labelSelected: {
    backgroundColor: '#F8F9FA',
    borderColor: 'rgba(0,0,0,0.2)',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  labelContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelIconContainer: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#4285F4',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  nativeMapLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#1A1A1A',
    textAlign: 'left',
    letterSpacing: -0.1,
    flex: 1,
  },
  recenterButton: {
    position: "absolute", right: 20, bottom: 100, width: 44, height: 44, borderRadius: 22, backgroundColor: "#FFF",
    alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 5,
  },
  recenterButtonText: {
    fontSize: 20,
  },
  // Bottom Sheet Styles - Google Maps style
  bottomSheetContainer: {
    position: "absolute",
    bottom: BOTTOM_TAB_HEIGHT + BOTTOM_SHEET_OFFSET, // Position above tab bar with offset
    left: 0,
    right: 0,
    width: SCREEN_WIDTH,
    height: BOTTOM_SHEET_MAX_HEIGHT,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 20, // Higher than tab bar
    zIndex: 9999, // Much higher than tab bar
    overflow: "hidden",
  },
  dragHandleArea: {
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: "#D1D1D6",
    borderRadius: 2,
  },
  bottomSheetScrollView: {
    flex: 1,
  },
  bottomSheetContent: {
    paddingBottom: BOTTOM_TAB_HEIGHT + 20,
  },
  bottomSheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  bottomSheetHeaderLeft: {
    flex: 1,
  },
  bottomSheetHeaderRight: {
    flexDirection: "row",
    gap: 12,
  },
  headerIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F2F2F7",
    alignItems: "center",
    justifyContent: "center",
  },
  bottomSheetTitleSection: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  bottomSheetTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#000",
    marginBottom: 8,
    lineHeight: 32,
  },
  bottomSheetSubtitleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  bottomSheetSubtitle: {
    fontSize: 14,
    color: "#666",
    fontWeight: "500",
  },
  subtitleSeparator: {
    fontSize: 14,
    color: "#666",
  },
  actionButtonsRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 8,
  },
  actionButtonSecondary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F2F2F7",
    borderRadius: 24,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 6,
  },
  actionButtonSecondaryText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0f5b63",
  },
  actionButtonPrimary: {
    flex: 1.5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f5b63",
    borderRadius: 24,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 6,
  },
  actionButtonPrimaryText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  imageGalleryContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
    marginBottom: 12,
  },
  imageGalleryScrollContent: {
    paddingRight: 16,
  },
  galleryImage: {
    width: 280,
    height: 200,
    borderRadius: 12,
    backgroundColor: "#F2F2F7",
    marginRight: 12,
  },
  noImagePlaceholder: {
    width: "100%",
    height: 200,
    borderRadius: 12,
  },
  statusRow: {
    marginTop: 8,
  },
  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusBadgeOpen: {
    backgroundColor: "#E8F5E9",
  },
  statusBadgeClosed: {
    backgroundColor: "#FFEBEE",
  },
  statusText: {
    fontSize: 13,
    fontWeight: "600",
  },
  statusTextOpen: {
    color: "#4CAF50",
  },
  statusTextClosed: {
    color: "#F44336",
  },
  announcementBanner: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: "#E8F4F8",
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: "#0f5b63",
  },
  announcementHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 12,
  },
  announcementTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0f5b63",
    flex: 1,
  },
  translateButtonContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  translateIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F2F2F7",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E5E5EA",
    borderStyle: "dashed",
  },
  showOriginalButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#E8F4F8",
    borderWidth: 1,
    borderColor: "#0f5b63",
  },
  showOriginalButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0f5b63",
  },
  announcementText: {
    fontSize: 15,
    color: "#000",
    lineHeight: 22,
    fontWeight: "400",
  },
  imageScrollView: {
    flexGrow: 0,
  },
  imageScrollContent: {
    paddingHorizontal: 16,
  },
  imageGridItem: {
    width: SCREEN_WIDTH * 0.40,
    aspectRatio: 1,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#F2F2F7",
    marginRight: 8,
  },
  gridImage: {
    width: "100%",
    height: "100%",
  },
  photoModalContainer: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  photoModalCloseButton: {
    position: "absolute",
    top: 50,
    right: 20,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  photoModalScrollView: {
    flex: 1,
  },
  photoModalImageContainer: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
  },
  photoModalImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  photoCounter: {
    position: "absolute",
    bottom: 50,
    alignSelf: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  photoCounterText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  noDataText: {
    fontSize: 15,
    color: "#999",
    fontStyle: "italic",
  },
  detailsSection: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  detailCard: {
    backgroundColor: "#F5F5F5",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  detailCardContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  detailCardTextContainer: {
    flex: 1,
  },
  detailCardText: {
    fontSize: 15,
    color: "#000",
    fontWeight: "400",
  },
  detailCardStatus: {
    fontSize: 15,
    color: "#4CAF50",
    fontWeight: "500",
  },
  detailCardStatusClosed: {
    color: "#F44336",
  },
  openingHoursTable: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
  },
  openingHoursRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  openingHoursRowToday: {
    backgroundColor: "transparent",
  },
  openingHoursDay: {
    fontSize: 15,
    color: "#666",
    fontWeight: "400",
  },
  openingHoursDayToday: {
    color: "#000",
    fontWeight: "600",
  },
  openingHoursTime: {
    fontSize: 15,
    color: "#000",
    fontWeight: "400",
  },
  openingHoursClosed: {
    color: "#999",
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 12,
  },
  detailText: {
    fontSize: 15,
    color: "#000",
    flex: 1,
  },
  descriptionSection: {
    marginTop: 8,
    marginBottom: 16,
  },
  descriptionSectionInline: {
    marginTop: 12,
    marginBottom: 16,
  },
  descriptionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  descriptionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
    marginBottom: 8,
  },
  descriptionTitleInline: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
    flex: 1,
  },
  descriptionText: {
    fontSize: 15,
    color: "#333",
    lineHeight: 22,
  },
  descriptionTextInline: {
    fontSize: 15,
    color: "#333",
    lineHeight: 22,
  },
  socialLinkText: {
    fontSize: 15,
    color: "#0f5b63",
    textDecorationLine: "underline",
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F2F2F7",
    alignItems: "center",
    justifyContent: "center",
  },
  adminActionsSection: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    gap: 12,
  },
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f5b63",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 8,
  },
  editButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#DC3545",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 8,
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  // Search Styles
  searchContainer: {
    position: "absolute",
    top: 50,
    left: 16,
    right: 16,
    zIndex: 1000,
    flexDirection: "row",
    alignItems: "center",
  },
  searchInputTouchable: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInputPlaceholder: {
    flex: 1,
    fontSize: 16,
    color: "#666",
  },
  loader: {
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "70%",
    padding: 16,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#333",
  },
  modalCloseButton: {
    fontSize: 24,
    color: "#666",
    fontWeight: "300",
  },
  modalSearchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8F9FA",
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  modalSearchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: "#333",
  },
  modalSearchIcon: {
    marginLeft: 8,
  },
  searchResultsList: {
    maxHeight: 400,
  },
  searchResultItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  searchResultName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  searchResultDetails: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  searchResultCity: {
    fontSize: 14,
    color: "#666",
  },
  searchResultSeparator: {
    fontSize: 14,
    color: "#999",
    marginHorizontal: 4,
  },
  searchResultCategory: {
    fontSize: 14,
    color: "#666",
  },
  noResults: {
    padding: 16,
    textAlign: "center",
    color: "#999",
    fontSize: 14,
  },
  // User Location Marker
  userLocationMarker: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#0f5b63",
    borderWidth: 3,
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  userLocationDot: {
    flex: 1,
    borderRadius: 7,
    backgroundColor: "#0f5b63",
  },
  // Custom Pin Marker
  customPinMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#ff6b6b",
    borderWidth: 3,
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  customPinDot: {
    flex: 1,
    borderRadius: 9,
    backgroundColor: "#ff6b6b",
  },
  // Destination Marker
  destinationMarker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#fff",
    borderWidth: 3,
    borderColor: "#28a745",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  destinationMarkerText: {
    fontSize: 24,
  },
  languageSelectorModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  languageSelectorModal: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
    width: SCREEN_WIDTH * 0.8,
    maxWidth: 320,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  languageSelectorTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#000",
    marginBottom: 8,
    textAlign: "center",
  },
  languageSelectorSubtitle: {
    fontSize: 14,
    color: "#666",
    marginBottom: 20,
    textAlign: "center",
  },
  languageOption: {
    backgroundColor: "#F2F2F7",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    alignItems: "center",
  },
  languageOptionText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#0f5b63",
  },
  languageSelectorCancel: {
    marginTop: 8,
    padding: 12,
    alignItems: "center",
  },
  languageSelectorCancelText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#666",
  },
});
