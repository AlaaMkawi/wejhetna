// src/screens/businessOwner/BusinessOwnerHomeScreen.tsx

import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { appAlert } from "../../utils/appAlert";
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, Image, PanResponder, StatusBar, Dimensions, Linking, Modal, ActivityIndicator, DeviceEventEmitter } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { PointAnnotation } from "@maplibre/maplibre-react-native";
import { FocusedMapView } from "../../components/map/FocusedMapView";
import { RegularHomeMapCamera } from "../../components/map/RegularHomeMapCamera";
import HomeMapPlaceMarkers from "../../components/map/HomeMapPlaceMarkers";
import { UserLocationDot } from "../../components/map/UserLocationDot";
import { useHomeMapScreen } from "../../components/map/useHomeMapScreen";
import { useRoute, RouteProp, useFocusEffect, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";
import { fetchAllPlaces, PlaceForMap, savePlace, unsavePlace, checkIfPlaceSaved, Category, translateText } from "../../api/places";
import { getUserProfile } from "../../api/profileApi";
import {
  createRideRequest,
  getNearbyDrivers,
  NearbyDriver,
  parseStoredUserId,
  rideApiDetailToTranslationKey,
} from "../../api/rides";
import { NEARBY_DRIVER_RADIUS_M, RIDE_STATUS_POLL_INTERVAL_MS } from "../../../config";
import { useInitialMapGeolocation } from "../../hooks/useInitialMapGeolocation";
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
import { useOverlayBottomOffset } from "../../theme/safeArea";
import { isOpenNow } from "../../utils/openingHours";
import MapInlineSearch from "../../components/map/MapInlineSearch";
import DriverInfoPopup from "../../components/ride/DriverInfoPopup";
import { NearbyDriverTaxiMarker } from "../../components/map/NearbyDriverTaxiMarker";
import { RideDriverClusterMarker } from "../../components/map/RideDriverClusterMarker";
import {
  clusterNearbyDrivers,
  zoomInTargetForCluster,
} from "../../utils/nearbyDriverClustering";
import { runOpenDrivingRoutePreviewFromHome } from "../../utils/homeMapRoutePreview";
import {
  mapPickStateForChoicePanel,
  startMapPickNavigation,
} from "../../utils/mapPickedDestination";
import { refreshHomeMapUserLocation } from "../../utils/refreshHomeMapUserLocation";
import { assertDestinationInServiceCities } from "../../utils/destinationBoundaryValidation";
import { formatDistance } from "../../utils/formatDistance";
import { useHomeMapDraftNavigationCleanup } from "../../hooks/useHomeMapDraftNavigationCleanup";
import { useRegularHomeMapCamera } from "../../hooks/useRegularHomeMapCamera";
import { getCurrentPositionReliable } from "../../utils/locationPermission";
import {
  destinationAfterClosingPlaceDetails,
  shouldShowCustomMapPin,
  shouldShowDestinationMapPin,
} from "../../utils/placeDetailsMapPin";
import { MapPickedDestinationChoiceModal } from "../../components/map/MapPickedDestinationChoiceModal";
import { PlaceDetailsActionButtons } from "../../components/place/PlaceDetailsActionButtons";
import { PlaceDetailsManageActions } from "../../components/place/PlaceDetailsManageActions";
import { usePlaceDetailsRideCtaState } from "../../hooks/usePlaceDetailsRideCtaState";
import { useSyncPlaceDetailsDestination } from "../../hooks/useSyncPlaceDetailsDestination";

const MAP_STYLE_URL =
  "https://api.maptiler.com/maps/019b0319-f856-79df-b13b-917c4a28f9a8/style.json?key=Js2mV1WY15ayeXH6ceQP";

const INITIAL_CENTER: [number, number] = [34.83, 31.24];
const INITIAL_ZOOM = 12.5;

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');
const BOTTOM_TAB_HEIGHT = 80; // גובה הבאנל התחתון (עם ה-rounded corners)
const BOTTOM_SHEET_MIN_HEIGHT = 360; // גובה מינימלי של ה-bottom sheet
const BOTTOM_SHEET_MAX_HEIGHT = SCREEN_HEIGHT * 0.75; // גובה מקסימלי (75% מהמסך)
const BOTTOM_SHEET_OFFSET = 25; // מרחק נוסף מעל ה-tab bar (ללא חפיפה)
const MAP_PICK_DEST_FAB_BOTTOM = 124;
const MAP_PICK_DEST_BANNER_BOTTOM = MAP_PICK_DEST_FAB_BOTTOM + 56 + 12;
const MAP_LOCATE_ME_FAB_BOTTOM = 124;

function haversineDistanceKm(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number
): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(toLat - fromLat);
  const dLon = toRad(toLon - fromLon);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(fromLat)) *
      Math.cos(toRad(toLat)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(6371 * c * 100) / 100;
}

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
  return isOpenNow(openingHours);
};
type Props = {
  navigation: any;
  route?: RouteProp<any, any>;
};

export default function BusinessOwnerHomeScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const mapPickFabBottom = useOverlayBottomOffset(MAP_PICK_DEST_FAB_BOTTOM);
  const mapPickBannerBottom = useOverlayBottomOffset(MAP_PICK_DEST_BANNER_BOTTOM);
  const mapLocateMeFabBottom = useOverlayBottomOffset(MAP_LOCATE_ME_FAB_BOTTOM);
  const routeParams = useRoute();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const selectedPlaceIdFromParams = (routeParams.params as any)?.selectedPlaceId as number | undefined;
  const cameraRef = useRef<any>(null);
  const placeCameraFocusedIdRef = useRef<number | null>(null);

  // Places
  const [places, setPlaces] = useState<PlaceForMap[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<PlaceForMap | null>(null);
  const selectedPlaceIdRef = useRef<number | null>(null);
  const [markerZoom, setMarkerZoom] = useState(INITIAL_ZOOM);

  // Save/Unsave place
  const [isPlaceSaved, setIsPlaceSaved] = useState(false);
  const [savingPlace, setSavingPlace] = useState(false);
  const [userId, setUserId] = useState<number | null>(null);
  const [userPhone, setUserPhone] = useState<string>("");
  const [nearbyDrivers, setNearbyDrivers] = useState<NearbyDriver[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<NearbyDriver | null>(null);
  const [ridePassengers, setRidePassengers] = useState<number>(1);
  const [rideDestinationInput, setRideDestinationInput] = useState("");
  const [rideFieldHighlight, setRideFieldHighlight] = useState({ pickup: false, destination: false });
  const rideMapPickSkipRouteRef = useRef(false);
  const pendingRideDriverRef = useRef<NearbyDriver | null>(null);
  const [creatingRideRequest, setCreatingRideRequest] = useState(false);
  const [rideSendErrorHint, setRideSendErrorHint] = useState<string | null>(null);
  // Kept around so legacy place-search clearing code paths remain valid; the
  // inline form modal that consumed this query is gone in the unified flow.
  const [ridePlaceSearchQuery, setRidePlaceSearchQuery] = useState("");
  const [rideWithDriverLoading, setRideWithDriverLoading] = useState(false);

  const { rideWithDriverMuted, alertIfCannotBookRide, refreshPassengerRide } =
    usePlaceDetailsRideCtaState(userId, "BUSINESS_OWNER");

  // Ref for ScrollView to reset scroll position when place changes
  const scrollViewRef = useRef<ScrollView>(null);

  // GPS Location
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [hasShownLocationPermissionMessage, setHasShownLocationPermissionMessage] = useState(false);

  // Destination
  const [destination, setDestination] = useState<{ lat: number; lon: number; name?: string } | null>(null);
  const [customPin, setCustomPin] = useState<{ lat: number; lon: number } | null>(null);
  const [mapPickChoiceModalVisible, setMapPickChoiceModalVisible] = useState(false);

  useSyncPlaceDetailsDestination(selectedPlace, destination, setDestination, getPlaceName);

  // Route
  const [routeLoading, setRouteLoading] = useState(false);
  const [isPickingMapDestination, setIsPickingMapDestination] = useState(false);
  const [pickPreviewCoords, setPickPreviewCoords] = useState<{ lat: number; lon: number } | null>(
    null
  );
  const pickMapTapInFlightRef = useRef(false);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PlaceForMap[]>([]);

  const { showAnnotations, mapShellMounted } = useHomeMapScreen({
    onPrepareLeaveForRoute: () => {
      setMapPickChoiceModalVisible(false);
      selectedPlaceIdRef.current = null;
      setSelectedPlace(null);
      setDestination(null);
      setCustomPin(null);
      setSearchResults([]);
      setPickPreviewCoords(null);
      setIsPickingMapDestination(false);
      pickMapTapInFlightRef.current = false;
    },
  });

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
        const parsedUserId = parseStoredUserId(storedUserId);
        if (parsedUserId != null) {
          setUserId(parsedUserId);
          try {
            const profile = await getUserProfile(parsedUserId);
            if (profile.phone) {
              setUserPhone(profile.phone);
            }
          } catch {
            /* best-effort */
          }
        }
        const storedPhone = await AsyncStorage.getItem("userPhone");
        if (storedPhone) {
          setUserPhone(storedPhone);
        }
      } catch (error) {
        console.error("Error loading user ID:", error);
      }
    }
    loadUserId();
  }, []);

  const refreshUserLocationOnHome = React.useCallback(() => {
    void refreshHomeMapUserLocation(setUserLocation);
  }, []);

  useHomeMapDraftNavigationCleanup({
    setRouteLoading,
    setDestination,
    setCustomPin,
    setIsPickingMapDestination,
    setPickPreviewCoords,
    pickMapTapInFlightRef,
    setMapPickChoiceModalVisible,
    refreshUserLocation: refreshUserLocationOnHome,
  });

  useInitialMapGeolocation(
    setUserLocation,
    setLocationLoading,
    hasShownLocationPermissionMessage,
    setHasShownLocationPermissionMessage
  );

  const {
    onRegionWillChange,
    onRegionDidChange,
    requestCameraMove,
    centerOnUserLocation,
  } = useRegularHomeMapCamera({
    cameraRef,
    setMarkerZoom,
  });

  const [locateMeLoading, setLocateMeLoading] = useState(false);

  const handleLocateMePress = useCallback(async () => {
    if (locateMeLoading) return;

    let loc = userLocation;
    if (!loc) {
      setLocateMeLoading(true);
      try {
        loc = await getCurrentPositionReliable();
        setUserLocation(loc);
      } catch {
        appAlert(t("error"), t("ride_location_unavailable_hint"));
        return;
      } finally {
        setLocateMeLoading(false);
      }
    }

    if (!loc) return;
    centerOnUserLocation(loc, { zoomLevel: 15.5, animationDuration: 720 });
  }, [locateMeLoading, userLocation, centerOnUserLocation, t]);

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
            }
          }
        } catch (e) {
          console.error("Failed to load places:", e);
        }
      }
      load();
      return () => {
        setIsPickingMapDestination(false);
        setPickPreviewCoords(null);
        pickMapTapInFlightRef.current = false;
      };
    }, [selectedPlaceIdFromParams])
  );


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
        appAlert(
          t("success") || "הצלחה",
          t("place_removed_from_saved") || "המקום הוסר מהשמורים"
        );
      } else {
        await savePlace(userId, selectedPlace.id);
        setIsPlaceSaved(true);
        appAlert(
          t("success") || "הצלחה",
          t("place_saved_successfully") || "המקום נשמר בהצלחה"
        );
      }
    } catch (error: any) {
      appAlert(
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

    appAlert(
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
            const placeClosed = selectedPlace;
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
              setDestination((d) => destinationAfterClosingPlaceDetails(d, placeClosed));
              appAlert(
                t("success") || "הצלחה",
                t("place_deleted_successfully") || "המקום נמחק בהצלחה"
              );
            } catch (error: any) {
              appAlert(
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

  const handleMapLongPress = async (e: any) => {
    try {
      const coords = e?.geometry?.coordinates;
      if (Array.isArray(coords) && coords.length >= 2) {
        const [lon, lat] = coords;
        const ok = await assertDestinationInServiceCities(lat, lon, t);
        if (!ok) return;
        const pick = mapPickStateForChoicePanel(
          lat,
          lon,
          t("map_selected_destination_label")
        );
        setCustomPin(pick.customPin);
        setDestination(pick.destination);
        setRideDestinationInput(pick.rideDestinationInput);
        selectedPlaceIdRef.current = null;
        setSelectedPlace(null);
        setSearchResults([]);
        setIsPickingMapDestination(false);
        setMapPickChoiceModalVisible(true);
      }
    } catch (error) {
      console.error("Error handling long press:", error);
    }
  };

  const dismissPlaceDetailsPanel = React.useCallback(() => {
    selectedPlaceIdRef.current = null;
    placeCameraFocusedIdRef.current = null;
    setSelectedPlace((prev) => {
      setDestination((d) => destinationAfterClosingPlaceDetails(d, prev));
      return null;
    });
  }, []);

  /**
   * Closes the picked-point panel by clearing the dropped pin and the associated
   * destination so the user can pick a new point or pick a known place.
   */
  const dismissPickedDestinationPanel = React.useCallback(() => {
    setMapPickChoiceModalVisible(false);
    setCustomPin(null);
    setDestination(null);
    setRideDestinationInput("");
  }, []);

  /** True when the active destination came from a map pick (long-press / tap-pick). */
  const isPickedDestinationActive =
    !!customPin && !selectedPlace && !!destination;

  const handlePlaceTap = useCallback((place: PlaceForMap) => {
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
  }, []);

  const handlePlaceMarkerPress = useCallback(
    (place: PlaceForMap) => {
      if (selectedPlace?.id === place.id) return;

      handlePlaceTap(place);

      if (!place.location) return;
      requestCameraMove(
        {
          centerCoordinate: [place.location.lon, place.location.lat],
          zoomLevel: 16.5,
          animationDuration: 700,
        },
        { userInitiated: true, reason: "place-marker-press-once" }
      );
      placeCameraFocusedIdRef.current = place.id;
    },
    [selectedPlace?.id, handlePlaceTap, requestCameraMove]
  );

  useEffect(() => {
    if (selectedPlaceIdFromParams && places.length > 0) {
      const place = places.find((p) => p.id === selectedPlaceIdFromParams);
      if (place?.location) {
        selectedPlaceIdRef.current = place.id;
        handlePlaceMarkerPress(place);
      }
    }
  }, [selectedPlaceIdFromParams, places, handlePlaceMarkerPress]);

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

  const filterPlacesByQuery = useCallback(
    (query: string): PlaceForMap[] => {
      if (!query || query.trim().length === 0 || !places?.length) {
        return [];
      }
      const queryLower = query.toLowerCase().trim();
      return places.filter((place) => {
        try {
          const nameMatch =
            (place.name && typeof place.name === "string" && place.name.toLowerCase().includes(queryLower)) ||
            (place.name_ar && typeof place.name_ar === "string" && place.name_ar.toLowerCase().includes(queryLower)) ||
            (place.name_he && typeof place.name_he === "string" && place.name_he.toLowerCase().includes(queryLower));
          const descriptionMatch =
            place.description &&
            typeof place.description === "string" &&
            place.description.toLowerCase().includes(queryLower);
          const cityMatch =
            (place.city?.name_ar && typeof place.city.name_ar === "string" && place.city.name_ar.toLowerCase().includes(queryLower)) ||
            (place.city?.name_he && typeof place.city.name_he === "string" && place.city.name_he.toLowerCase().includes(queryLower)) ||
            (place.city?.name_en && typeof place.city.name_en === "string" && place.city.name_en.toLowerCase().includes(queryLower));
          const categoryMatch =
            (place.category?.name_ar && typeof place.category.name_ar === "string" && place.category.name_ar.toLowerCase().includes(queryLower)) ||
            (place.category?.name_he && typeof place.category.name_he === "string" && place.category.name_he.toLowerCase().includes(queryLower)) ||
            (place.category?.name_en && typeof place.category.name_en === "string" && place.category.name_en.toLowerCase().includes(queryLower));
          const phoneMatch =
            place.phone &&
            typeof place.phone === "string" &&
            place.phone.replace(/[\s-]/g, "").includes(queryLower.replace(/[\s-]/g, ""));
          return nameMatch || descriptionMatch || cityMatch || categoryMatch || phoneMatch;
        } catch {
          return false;
        }
      });
    },
    [places]
  );

  const rideModalPlaceResults = useMemo(
    () => filterPlacesByQuery(ridePlaceSearchQuery).slice(0, 8),
    [filterPlacesByQuery, ridePlaceSearchQuery]
  );

  const applyPlaceToRideDestination = (place: PlaceForMap) => {
    if (!place.location) return;
    const name = getPlaceName(place);
    setDestination({
      lat: place.location.lat,
      lon: place.location.lon,
      name,
    });
    setRideDestinationInput(name);
    setRidePlaceSearchQuery("");
    setRideFieldHighlight((h) => ({ ...h, destination: false }));
  };

  const refreshNearbyDrivers = useCallback(async () => {
    if (!userId || !userLocation) return;
    try {
      const drivers = await getNearbyDrivers({
        regular_user_id: userId,
        lat: userLocation.lat,
        lon: userLocation.lon,
        radius_m: NEARBY_DRIVER_RADIUS_M,
      });
      setNearbyDrivers(drivers);
    } catch {
      setNearbyDrivers([]);
    }
  }, [userId, userLocation]);

  const focusNearbyDriversOnMap = useCallback(() => {
    void refreshNearbyDrivers();
    if (userLocation) {
      centerOnUserLocation(userLocation, { zoomLevel: 14, animationDuration: 900 });
    }
  }, [refreshNearbyDrivers, centerOnUserLocation, userLocation]);

  useEffect(() => {
    refreshNearbyDrivers();
  }, [refreshNearbyDrivers]);

  useEffect(() => {
    if (!selectedDriver) return;
    if (destination?.name) {
      setRideDestinationInput(destination.name);
    }
  }, [selectedDriver, destination?.lat, destination?.lon, destination?.name]);

  useEffect(() => {
    if (selectedDriver) {
      setRideSendErrorHint(null);
    }
  }, [selectedDriver]);

  useEffect(() => {
    if (userLocation) {
      setRideFieldHighlight((h) => (h.pickup ? { ...h, pickup: false } : h));
    }
  }, [userLocation]);

  useEffect(() => {
    if (selectedDriver) {
      setRidePlaceSearchQuery("");
    }
  }, [selectedDriver]);

  useEffect(() => {
    if (!userId || !userLocation) return;
    const interval = setInterval(() => {
      void refreshNearbyDrivers();
    }, RIDE_STATUS_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [userId, userLocation, refreshNearbyDrivers]);

  const handleCreateRideRequest = async (overrides?: { passengers?: number }) => {
    if (!userId || !selectedDriver) {
      return;
    }
    if (alertIfCannotBookRide()) {
      return;
    }

    const destinationText =
      rideDestinationInput.trim() ||
      (destination
        ? destination.name?.trim() ||
          `${destination.lat.toFixed(5)}, ${destination.lon.toFixed(5)}`
        : "");

    const missingPickup = !userLocation;
    const missingDest = !destinationText;
    setRideFieldHighlight({ pickup: missingPickup, destination: missingDest });

    if (missingPickup || missingDest) {
      if (missingPickup) {
        appAlert(t("error"), t("ride_location_unavailable_hint"));
      } else if (missingDest) {
        appAlert(
          t("error"),
          t("ride_destination_required") || t("ride_destination_input_placeholder")
        );
      }
      return;
    }
    if (!userPhone) {
      appAlert(t("error"), t("ride_phone_required"));
      return;
    }

    // Popup-driven counts take priority; fall back to the screen-level state
    // so legacy flows keep working unchanged. Mirrors the regular-user side.
    const passengersFromPopup =
      overrides?.passengers != null && Number.isFinite(overrides.passengers)
        ? Math.max(1, Math.min(12, Math.trunc(overrides.passengers)))
        : null;
    const passengers = passengersFromPopup ?? ridePassengers;
    if (passengers <= 0) {
      appAlert(t("error"), t("ride_invalid_people_or_seats"));
      return;
    }
    if (passengersFromPopup != null && passengersFromPopup !== ridePassengers) {
      setRidePassengers(passengersFromPopup);
    }

    setRideFieldHighlight({ pickup: false, destination: false });
    setRideSendErrorHint(null);
    setCreatingRideRequest(true);
    const payload = {
      regular_user_id: userId,
      driver_user_id: selectedDriver.driver_user_id,
      pickup_lat: userLocation.lat,
      pickup_lon: userLocation.lon,
      destination_text: destinationText,
      destination_lat: destination?.lat,
      destination_lon: destination?.lon,
      regular_phone: userPhone,
      passengers_count: passengers,
      number_of_people: passengers,
      number_of_seats_required: passengers,
    };
    try {
      await createRideRequest(payload);
      setRideSendErrorHint(null);
      setSelectedDriver(null);
      setMapPickChoiceModalVisible(false);
      if (customPin) {
        dismissPickedDestinationPanel();
      }
      void refreshPassengerRide();
      appAlert(t("success"), t("ride_request_sent"));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const short = msg.length > 180 ? `${msg.slice(0, 177)}…` : msg;
      setRideSendErrorHint(short || null);
      const key = rideApiDetailToTranslationKey(msg);
      appAlert(t("error"), key ? t(key) : t("ride_failed_create_request"), [{ text: t("ok") || "OK" }]);
    } finally {
      setCreatingRideRequest(false);
    }
  };

  const handleRideWithDriverFromPlaceDetails = async () => {
    if (!userId) {
      appAlert(t("error"), t("ride_session_invalid"));
      return;
    }
    if (alertIfCannotBookRide()) {
      return;
    }
    if (!userLocation) {
      appAlert(t("error"), t("ride_location_unavailable_hint"));
      return;
    }
    if (!destination) {
      return;
    }
    const destText =
      destination.name?.trim() ||
      `${destination.lat.toFixed(5)}, ${destination.lon.toFixed(5)}`;
    setRideDestinationInput(destText);
    setRideFieldHighlight({ pickup: false, destination: false });
    setRideWithDriverLoading(true);
    try {
      const drivers = await getNearbyDrivers({
        regular_user_id: userId,
        lat: userLocation.lat,
        lon: userLocation.lon,
        radius_m: NEARBY_DRIVER_RADIUS_M,
      });
      setNearbyDrivers(drivers);
      if (drivers.length === 0) {
        appAlert(t("error"), t("ride_no_drivers_nearby"));
        return;
      }
      // Focus the map on the fetched drivers so every available driver is
      // visible. Users then tap any driver marker to open the compact info
      // popup — same flow as the regular-user side (no list picker).
      focusNearbyDriversOnMap();
      if (drivers.length === 1) {
        // UX shortcut when there is only one option — open their popup directly.
        setSelectedDriver(drivers[0]);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const key = rideApiDetailToTranslationKey(msg);
      appAlert(t("error"), key ? t(key) : t("ride_failed_load_requests"), [{ text: t("ok") || "OK" }]);
    } finally {
      setRideWithDriverLoading(false);
    }
  };

  const getRoute = async (destOverride?: { lat: number; lon: number; name?: string } | null) => {
    const destSnapshot = destOverride ?? destination;
    if (!destSnapshot) {
      return;
    }
    pickMapTapInFlightRef.current = false;
    await runOpenDrivingRoutePreviewFromHome({
      navigation: nav,
      destination: destSnapshot,
      t,
      setRouteLoading,
    });
  };

  const startNavigationFromMapPick = () => {
    const destSnapshot = destination;
    void startMapPickNavigation({
      navigation: nav,
      destination: destSnapshot,
      t,
      setRouteLoading,
      onModalClose: () => setMapPickChoiceModalVisible(false),
      pickMapTapInFlightRef,
    });
  };

  const handleMapTapPickDestination = async (lat: number, lon: number) => {
    if (pickMapTapInFlightRef.current) return;
    pickMapTapInFlightRef.current = true;
    setPickPreviewCoords({ lat, lon });
    try {
      const ok = await assertDestinationInServiceCities(lat, lon, t);
      if (!ok) {
        setPickPreviewCoords(null);
        return;
      }
      setIsPickingMapDestination(false);
      setPickPreviewCoords(null);
      selectedPlaceIdRef.current = null;
      setSelectedPlace(null);
      setSearchResults([]);
      const pick = mapPickStateForChoicePanel(
        lat,
        lon,
        t("map_selected_destination_label")
      );
      setCustomPin(pick.customPin);
      setDestination(pick.destination);
      setRideDestinationInput(pick.rideDestinationInput);
      setMapPickChoiceModalVisible(true);
    } finally {
      pickMapTapInFlightRef.current = false;
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
        appAlert(
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
        appAlert(
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
        appAlert(
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
        appAlert(errorTitle, errorMessage);
        setAnnouncementIsTranslated(false);
        setAnnouncementTranslated(null);
        setAnnouncementTargetLang(null);
      } finally {
        setAnnouncementTranslating(false);
        setLanguageSelectorType(null);
      }
    } else if (languageSelectorType === "description") {
      if (!selectedPlace?.description) {
        appAlert(
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
        appAlert(errorTitle, errorMessage);
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

  /**
   * Group nearby drivers into singles/clusters/spread items so overlapping
   * markers don't obscure each other. Mirrors the regular-user flow so both
   * roles share the same selection experience.
   */
  const driverMapItems = useMemo(() => {
    if (nearbyDrivers.length === 0) return [];
    const anchorLat = userLocation?.lat ?? INITIAL_CENTER[1];
    return clusterNearbyDrivers(nearbyDrivers, markerZoom, anchorLat);
  }, [nearbyDrivers, markerZoom, userLocation?.lat]);

  /**
   * Tapping a cluster zooms the camera in by a couple of levels centered on
   * the cluster — the cluster naturally splits as meters-per-pixel shrinks.
   */
  const handleClusterTap = useCallback(
    (lat: number, lon: number) => {
      requestCameraMove(
        {
          centerCoordinate: [lon, lat],
          zoomLevel: zoomInTargetForCluster(markerZoom),
          animationDuration: 500,
        },
        { userInitiated: true, reason: "driver-cluster-tap" }
      );
    },
    [markerZoom, requestCameraMove]
  );

  const showCustomPinOnMap = shouldShowCustomMapPin(customPin, selectedPlace);
  const showDestinationPinOnMap = shouldShowDestinationMapPin(
    destination,
    customPin,
    selectedPlace
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {mapShellMounted ? (
      <FocusedMapView
        style={styles.map}
        mapStyle={MAP_STYLE_URL}
        onRegionWillChange={onRegionWillChange}
        onRegionDidChange={onRegionDidChange}
        onLongPress={handleMapLongPress}
        onPress={(e: any) => {
          try {
            const coords = e?.geometry?.coordinates;
            if (!Array.isArray(coords) || coords.length < 2) return;
            const [lon, lat] = coords;
            if (isPickingMapDestination) {
              void handleMapTapPickDestination(lat, lon);
              return;
            }
            const nearestPlace = places.find((place) => {
              if (!place.location) return false;
              const distance = Math.sqrt(
                Math.pow(place.location.lon - lon, 2) + Math.pow(place.location.lat - lat, 2)
              );
              return distance < 0.001;
            });
            if (nearestPlace) {
              handlePlaceMarkerPress(nearestPlace);
              return;
            }
            // Driver markers are intentionally compact, so a near-miss tap
            // should still resolve to the closest one. Hit-test against the
            // clustered items (singles/spread → open popup, cluster → zoom in)
            // to match the regular-user flow.
            const MAX_DRIVER_TAP_KM = 0.07;
            let closestItem: (typeof driverMapItems)[number] | null = null;
            let closestKm = MAX_DRIVER_TAP_KM;
            for (const item of driverMapItems) {
              const km = haversineDistanceKm(lat, lon, item.lat, item.lon);
              if (km < closestKm) {
                closestKm = km;
                closestItem = item;
              }
            }
            if (closestItem) {
              if (closestItem.type === "cluster") {
                handleClusterTap(closestItem.lat, closestItem.lon);
              } else {
                setSelectedDriver(closestItem.driver);
              }
            }
          } catch {
            /* ignore */
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
        <RegularHomeMapCamera cameraRef={cameraRef} />

        {showAnnotations && isPickingMapDestination && pickPreviewCoords && (
          <PointAnnotation
            id="map_pick_preview"
            coordinate={[pickPreviewCoords.lon, pickPreviewCoords.lat]}
          >
            <View style={styles.customPinMarker} accessibilityLabel={t("map_pick_preview_label")}>
              <View style={styles.customPinDot} />
            </View>
          </PointAnnotation>
        )}

        {showAnnotations && showCustomPinOnMap && customPin && (
          <PointAnnotation id="custom_pin" coordinate={[customPin.lon, customPin.lat]}>
            <View style={styles.customPinMarker} collapsable={false}>
              <View style={styles.customPinDot} />
            </View>
          </PointAnnotation>
        )}

        {showAnnotations && showDestinationPinOnMap && destination && (
          <PointAnnotation id="destination" coordinate={[destination.lon, destination.lat]}>
            <View style={styles.destinationMarker} collapsable={false}>
              <Text style={styles.destinationMarkerText}>📍</Text>
            </View>
          </PointAnnotation>
        )}

        {showAnnotations && !isPickingMapDestination ? (
          <HomeMapPlaceMarkers
            places={places}
            currentZoom={markerZoom}
            anchorLatitude={userLocation?.lat ?? INITIAL_CENTER[1]}
            selectedPlace={selectedPlace}
            getPlaceIcon={getPlaceIcon}
            getPlaceName={getPlaceName}
            onPlaceTap={handlePlaceMarkerPress}
            onClusterTap={(lat, lon) =>
              requestCameraMove(
                {
                  centerCoordinate: [lon, lat],
                  zoomLevel: zoomInTargetForCluster(markerZoom),
                  animationDuration: 500,
                },
                { userInitiated: true, reason: "place-cluster-tap" }
              )
            }
            useRegularHomeTapSplit
          />
        ) : null}

        {showAnnotations && userLocation && !isPickingMapDestination && (
          <PointAnnotation id="user_location" coordinate={[userLocation.lon, userLocation.lat]}>
            <UserLocationDot zoom={markerZoom} />
          </PointAnnotation>
        )}

        {/*
          Drivers render last so they sit above place pins (MapLibre draw order).
          `driverMapItems` clusters overlapping drivers so the user never sees a
          single icon standing in for several; tapping a cluster zooms in.
          Same component / pipeline as the regular-user flow for visual parity.
        */}
        {showAnnotations &&
          driverMapItems.map((item) => {
          if (item.type === "cluster") {
            const emphasized = item.drivers.some(
              (d) => d.driver_user_id === selectedDriver?.driver_user_id
            );
            return (
              <PointAnnotation
                key={item.id}
                id={item.id}
                coordinate={[item.lon, item.lat]}
                anchor={{ x: 0.5, y: 1 }}
                onSelected={() => handleClusterTap(item.lat, item.lon)}
              >
                <RideDriverClusterMarker
                  count={item.drivers.length}
                  emphasized={emphasized}
                  accessibilityLabel={
                    t("map_driver_cluster_label", { count: item.drivers.length }) ||
                    `${item.drivers.length} nearby drivers`
                  }
                />
              </PointAnnotation>
            );
          }

          const driver = item.driver;
          const isSelected =
            selectedDriver?.driver_user_id === driver.driver_user_id;
          return (
            <PointAnnotation
              key={item.id}
              id={item.id}
              coordinate={[item.lon, item.lat]}
              anchor={{ x: 0.5, y: 1 }}
              onSelected={() => setSelectedDriver(driver)}
            >
              <NearbyDriverTaxiMarker
                selected={isSelected}
                accessibilityLabel={t("ride_driver_info")}
              />
            </PointAnnotation>
          );
        })}
      </FocusedMapView>
      ) : (
        <View style={styles.map} />
      )}

      <MapInlineSearch
        value={searchQuery}
        onChangeText={handleSearch}
        placeholder={t("search_places") || "Search places..."}
        locationLoading={locationLoading}
        results={searchResults}
        getResultTitle={getPlaceName}
        getResultSubtitle={(place) => {
          const city = getCityName(place.city);
          const cat = place.category
            ? i18n.language === "he" && place.category.name_he
              ? place.category.name_he
              : i18n.language === "ar" && place.category.name_ar
                ? place.category.name_ar
                : place.category.name_ar || place.category.name_he || ""
            : "";
          if (city && cat) return `${city} · ${cat}`;
          return city || cat || undefined;
        }}
        onSelectPlace={(place) => {
          handlePlaceMarkerPress(place);
          setSearchQuery("");
        }}
        emptyHint={t("start_typing_to_search") || "Start typing to search places..."}
        noResultsText={t("no_places_found") || "No places found"}
        onSearchFocus={dismissPlaceDetailsPanel}
      />

      <TouchableOpacity
        style={[styles.locateMeFab, { bottom: mapLocateMeFabBottom }]}
        onPress={() => void handleLocateMePress()}
        disabled={locateMeLoading}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={t("my_location")}
      >
        {locateMeLoading ? (
          <ActivityIndicator size="small" color="#0f5b63" />
        ) : (
          <Ionicons name="locate" size={22} color="#0f5b63" />
        )}
      </TouchableOpacity>

      {!mapPickChoiceModalVisible ? (
      <TouchableOpacity
        style={[
          styles.pickDestinationFab,
          { bottom: mapPickFabBottom },
          isPickingMapDestination && styles.pickDestinationFabActive,
        ]}
        onPress={() => {
          setIsPickingMapDestination((v) => {
            const next = !v;
            if (!next) {
              setPickPreviewCoords(null);
              pickMapTapInFlightRef.current = false;
              rideMapPickSkipRouteRef.current = false;
              if (pendingRideDriverRef.current) {
                setSelectedDriver(pendingRideDriverRef.current);
                pendingRideDriverRef.current = null;
              }
            }
            return next;
          });
        }}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={t("map_pick_destination_title")}
        accessibilityState={{ selected: isPickingMapDestination }}
      >
        <Ionicons
          name={isPickingMapDestination ? "close" : "navigate-outline"}
          size={26}
          color="#FFFFFF"
        />
      </TouchableOpacity>
      ) : null}

      {isPickingMapDestination && !mapPickChoiceModalVisible && (
        <View
          style={[styles.pickDestinationBanner, { bottom: mapPickBannerBottom }]}
          pointerEvents="box-none"
        >
          <View style={styles.pickDestinationBannerInner}>
            <View style={styles.pickDestinationBannerTextCol}>
              <Text style={styles.pickDestinationBannerTitle}>{t("map_pick_destination_banner_title")}</Text>
              <Text style={styles.pickDestinationBannerBody}>{t("map_pick_destination_banner_body")}</Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                setIsPickingMapDestination(false);
                setPickPreviewCoords(null);
                pickMapTapInFlightRef.current = false;
                rideMapPickSkipRouteRef.current = false;
                if (pendingRideDriverRef.current) {
                  setSelectedDriver(pendingRideDriverRef.current);
                  pendingRideDriverRef.current = null;
                }
              }}
              style={styles.pickDestinationCancelBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.pickDestinationCancelText}>{t("map_pick_destination_cancel")}</Text>
            </TouchableOpacity>
          </View>
        </View>
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
              onPress={dismissPlaceDetailsPanel}
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

            {/* Action buttons: two rows (share/save, then nav/ride) so labels are not truncated */}
            <PlaceDetailsActionButtons
              hasDestination={!!destination}
              routeLoading={routeLoading}
              rideWithDriverLoading={rideWithDriverLoading}
              rideWithDriverMuted={rideWithDriverMuted}
              isPlaceSaved={isPlaceSaved}
              savingPlace={savingPlace}
              canSave={!!userId}
              onToggleSave={() => void handleToggleSave()}
              onStartNavigation={() => void getRoute()}
              onRideWithDriver={() => void handleRideWithDriverFromPlaceDetails()}
            />

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
                      appAlert(t("error") || "Error", t("could_not_open_link") || "Could not open link");
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

            <PlaceDetailsManageActions
              showEdit={!!isOwnPlace}
              showDelete={!!isOwnPlace}
              onEdit={handleEditPlace}
              onDelete={handleDeletePlace}
              editLabel={
                i18n.language === "ar"
                  ? "تعديل معلومات عملي"
                  : "ערוך את פרטי העסק שלי"
              }
            />
            </ScrollView>
          </>
        </Animated.View>
      )}

      <MapPickedDestinationChoiceModal
        visible={mapPickChoiceModalVisible}
        onDismiss={dismissPickedDestinationPanel}
        onStartNavigation={startNavigationFromMapPick}
        onRideWithDriver={() => {
          setMapPickChoiceModalVisible(false);
          pickMapTapInFlightRef.current = false;
          void handleRideWithDriverFromPlaceDetails();
        }}
        navigationLoading={routeLoading}
        rideWithDriverLoading={rideWithDriverLoading}
        rideWithDriverMuted={rideWithDriverMuted}
      />

      {/* Compact, map-anchored driver info popup — unified with the regular-user
          flow. Replaces the legacy form modal + driver list picker. */}
      <DriverInfoPopup
        visible={!!selectedDriver}
        driver={selectedDriver}
        destinationText={
          rideDestinationInput?.trim() ||
          destination?.name?.trim() ||
          (destination
            ? `${destination.lat.toFixed(5)}, ${destination.lon.toFixed(5)}`
            : null)
        }
        distanceKm={
          selectedDriver && userLocation
            ? Number(
                haversineDistanceKm(
                  userLocation.lat,
                  userLocation.lon,
                  selectedDriver.lat,
                  selectedDriver.lon
                )
              )
            : selectedDriver?.distance_km ?? null
        }
        sending={creatingRideRequest}
        errorHint={rideSendErrorHint}
        initialPassengers={ridePassengers}
        onClose={() => {
          setSelectedDriver(null);
          setRideSendErrorHint(null);
        }}
        onSendRequest={({ passengers }) => {
          void handleCreateRideRequest({ passengers });
        }}
      />

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
  locateMeFab: {
    position: "absolute",
    right: 20,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1100,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 1,
    borderColor: "rgba(15, 91, 99, 0.14)",
  },
  pickDestinationFab: {
    position: "absolute",
    left: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#0f5b63",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1100,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 10,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.95)",
  },
  pickDestinationFabActive: {
    backgroundColor: "#0a4a52",
    borderColor: "rgba(255,255,255,0.55)",
  },
  pickDestinationBanner: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 1099,
  },
  pickDestinationBannerInner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.97)",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "rgba(15, 91, 99, 0.22)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 8,
  },
  pickDestinationBannerTextCol: {
    flex: 1,
    marginRight: 10,
  },
  pickDestinationBannerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1a1a1a",
    letterSpacing: -0.3,
  },
  pickDestinationBannerBody: {
    marginTop: 4,
    fontSize: 14,
    color: "#5F6368",
    lineHeight: 20,
  },
  pickDestinationCancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  pickDestinationCancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0f5b63",
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
  actionButtonsBlock: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 10,
  },
  actionButtonsRowTop: {
    flexDirection: "row",
    gap: 8,
  },
  actionButtonsRowNavRide: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
    width: "100%",
  },
  actionButtonSecondary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F2F2F7",
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 8,
    minHeight: 48,
  },
  actionButtonSecondaryText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0f5b63",
    textAlign: "center",
    flexShrink: 1,
  },
  actionButtonPrimary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f5b63",
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 8,
    minHeight: 50,
  },
  actionButtonPrimaryFull: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f5b63",
    borderRadius: 24,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 8,
    width: "100%",
  },
  actionButtonPrimaryText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
    textAlign: "center",
    flexShrink: 1,
  },
  actionButtonPrimarySplit: {
    flex: 1,
    minWidth: 0,
  },
  actionButtonCtaLabel: {
    textAlign: "center",
    flexShrink: 1,
  },
  actionButtonRideWithDriver: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 10,
    gap: 8,
    borderWidth: 2,
    borderColor: "#0f5b63",
    minHeight: 50,
  },
  actionButtonRideWithDriverText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0f5b63",
    textAlign: "center",
    flexShrink: 1,
  },
  actionButtonRideWithDriverMuted: {
    borderColor: "#c4c4c4",
    backgroundColor: "#f4f4f4",
    opacity: 0.92,
  },
  actionButtonRideWithDriverTextMuted: {
    color: "#888",
  },
  driverMarker: {
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRadius: 22,
    backgroundColor: "#0f5b63",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  rideModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 18,
  },
  rideModalCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    maxHeight: SCREEN_HEIGHT * 0.78,
    borderTopWidth: 5,
    borderTopColor: "#0f5b63",
    overflow: "hidden",
  },
  rideModalBuildBand: {
    backgroundColor: "#e8f4f5",
    marginHorizontal: -16,
    marginTop: -16,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(15,91,99,0.12)",
  },
  rideModalBuildBandText: {
    color: "#0f5b63",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  rideModalSessionWarn: {
    backgroundColor: "#fff3cd",
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e6d4a8",
  },
  rideModalSessionWarnText: { color: "#664d03", fontSize: 13, textAlign: "center", lineHeight: 18 },
  rideModalDebugId: { fontSize: 12, color: "#666", marginBottom: 8, textAlign: "center" },
  rideModalErrorHint: {
    marginTop: 12,
    fontSize: 12,
    color: "#842029",
    lineHeight: 17,
    textAlign: "center",
  },
  rideModalSectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0f5b63",
    marginTop: 10,
    marginBottom: 6,
  },
  rideModalFieldBox: {
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    borderRadius: 10,
    padding: 10,
    marginBottom: 4,
    backgroundColor: "#fafafa",
  },
  rideModalFieldBoxError: {
    borderColor: "#dc3545",
    backgroundColor: "#fff5f5",
  },
  rideModalTextInput: {
    fontSize: 14,
    color: "#222",
    minHeight: 44,
    textAlignVertical: "top",
    paddingVertical: 4,
  },
  rideModalMapLink: {
    marginTop: 8,
    alignSelf: "flex-start",
  },
  rideModalMapLinkText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0f5b63",
    textDecorationLine: "underline",
  },
  rideModalHint: {
    fontSize: 12,
    color: "#555",
    marginBottom: 6,
    lineHeight: 17,
  },
  rideModalSearchInput: {
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: "#222",
    marginBottom: 8,
    backgroundColor: "#fff",
  },
  rideModalSearchResults: {
    maxHeight: 200,
    marginBottom: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(15,91,99,0.15)",
    overflow: "hidden",
    backgroundColor: "#fafdfd",
  },
  rideModalSearchRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  rideModalSearchRowTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111",
  },
  rideModalSearchRowSub: {
    fontSize: 12,
    color: "#666",
    marginTop: 2,
  },
  rideModalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111",
    marginBottom: 8,
  },
  rideModalText: {
    fontSize: 14,
    color: "#222",
    marginBottom: 6,
  },
  ridePassengerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginVertical: 8,
  },
  passengerBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#e6eef0",
    alignItems: "center",
    justifyContent: "center",
  },
  passengerBtnText: {
    color: "#0f5b63",
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 20,
  },
  rideRequestButton: {
    backgroundColor: "#0f5b63",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 10,
  },
  rideRequestButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  rideDriverPickerCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    maxHeight: SCREEN_HEIGHT * 0.55,
    width: "100%",
    borderTopWidth: 5,
    borderTopColor: "#0f5b63",
  },
  rideDriverPickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.08)",
  },
  rideDriverPickerRowText: {
    flex: 1,
    minWidth: 0,
  },
  rideDriverPickerName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111",
  },
  rideDriverPickerMeta: {
    fontSize: 12,
    color: "#666",
    marginTop: 2,
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
