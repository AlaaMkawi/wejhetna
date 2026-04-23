// src/screens/RegularAccount/RegularHomeScreen.tsx

import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Image,
  PanResponder,
  StatusBar,
  Dimensions,
  Linking,
  Modal,
  ActivityIndicator,
  DeviceEventEmitter,
  FlatList,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { MapView, Camera, PointAnnotation } from "@maplibre/maplibre-react-native";
import { useRoute, RouteProp, useNavigation, useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";
import { fetchAllPlaces, PlaceForMap, savePlace, unsavePlace, checkIfPlaceSaved, Category, translateText } from "../../api/places";
import { useInitialMapGeolocation } from "../../hooks/useInitialMapGeolocation";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Ionicons from 'react-native-vector-icons/Ionicons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import i18n from "../../i18n";
import { useTranslation } from "react-i18next";
import { collectBusinessImageUrls, formatApiImageUri } from "../../utils/imageUrl";
import { isOpenNow } from "../../utils/openingHours";
import MapInlineSearch from "../../components/map/MapInlineSearch";
import DriverInfoPopup from "../../components/ride/DriverInfoPopup";
import { RideDriverMapMarker } from "../../components/map/RideDriverMapMarker";
import { RideDriverClusterMarker } from "../../components/map/RideDriverClusterMarker";
import {
  clusterNearbyDrivers,
  zoomInTargetForCluster,
} from "../../utils/nearbyDriverClustering";
import { openDrivingRoutePreview } from "../../navigation/openDrivingRoutePreview";
import { assertDestinationInServiceCities } from "../../utils/destinationBoundaryValidation";
import { LIVE_NAVIGATION_EXIT_EVENT } from "../../navigation/navigationEvents";
import { destinationAfterClosingPlaceDetails } from "../../utils/placeDetailsMapPin";
import {
  createRideRequest,
  getNearbyDrivers,
  getRegularLatestRideRequest,
  isActiveBlockingRideStatus,
  NearbyDriver,
  parseStoredUserId,
  RegularLatestRideRequest,
  rideApiDetailToTranslationKey,
} from "../../api/rides";
import { NEARBY_DRIVER_RADIUS_M, RIDE_STATUS_POLL_INTERVAL_MS, RIDE_UI_BUILD } from "../../../config";
import { getUserProfile } from "../../api/profileApi";

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

// Helper function to check if business is currently open
const isBusinessCurrentlyOpen = (openingHours: string | null | undefined): boolean => {
  return isOpenNow(openingHours);
};

// Helper function to get opening hours status text (e.g., "Closed · Opens 10:30 Sat")
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
          // Today but closed, opens later today
          return `${statusText} · ${opensText} ${hour}:${minute} ${period}`;
        } else {
          // Opens on another day
          return `${statusText} · ${opensText} ${hour}:${minute} ${period} ${localizedDayName}`;
        }
      }
    }
  }
  
  return i18n.language === "ar" ? "مغلق" : "סגור";
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

const haversineDistanceKm = (
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number
): number => {
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
};

type Props = {
  navigation: any;
  route?: RouteProp<any, any>;
};

export default function RegularHomeScreen({}: Props) {
  const { t } = useTranslation();
  const routeParams = useRoute();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const selectedPlaceIdFromParams = (routeParams.params as any)?.selectedPlaceId as number | undefined;
  const cameraRef = useRef<any>(null);

  // Places
  const [places, setPlaces] = useState<PlaceForMap[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<PlaceForMap | null>(null);
  const [currentZoom, setCurrentZoom] = useState(INITIAL_ZOOM);

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
  /** Shown under send button after a failed POST (short hint for debugging). */
  const [rideSendErrorHint, setRideSendErrorHint] = useState<string | null>(null);
  const [ridePlaceSearchQuery, setRidePlaceSearchQuery] = useState("");
  const [rideWithDriverLoading, setRideWithDriverLoading] = useState(false);
  const [passengerRideLatest, setPassengerRideLatest] = useState<RegularLatestRideRequest | null>(null);

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
  /** Tap map to pick a destination (Tel Sheva / Lakiya / Rahat) and open route preview. */
  const [isPickingMapDestination, setIsPickingMapDestination] = useState(false);
  /** Red preview dot while choosing a point (cleared on cancel or success). */
  const [pickPreviewCoords, setPickPreviewCoords] = useState<{ lat: number; lon: number } | null>(
    null
  );
  const pickMapTapInFlightRef = useRef(false);

  // Navigation (tracking movement) - removed, now handled in RouteDetailsScreen

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PlaceForMap[]>([]);

  // Photo gallery modal
  const [photoModalVisible, setPhotoModalVisible] = useState(false);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  const photoScrollViewRef = useRef<ScrollView>(null);


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

  // Opening hours expand state
  const [openingHoursExpanded, setOpeningHoursExpanded] = useState(false);

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
            // fallback to AsyncStorage value when profile fetch fails
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

  useInitialMapGeolocation(
    setUserLocation,
    setLocationLoading,
    hasShownLocationPermissionMessage,
    setHasShownLocationPermissionMessage
  );

  useFocusEffect(
    useCallback(() => {
      return () => {
        setIsPickingMapDestination(false);
        setPickPreviewCoords(null);
        pickMapTapInFlightRef.current = false;
      };
    }, [])
  );

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(LIVE_NAVIGATION_EXIT_EVENT, () => {
      setDestination(null);
      setCustomPin(null);
      setIsPickingMapDestination(false);
      setPickPreviewCoords(null);
    });
    return () => sub.remove();
  }, []);

  // Fetch all places on mount
  useEffect(() => {
    async function load() {
      try {
        const data = await fetchAllPlaces();
        console.log(`Loaded ${data.length} places from database`);
        setPlaces(data);
      } catch (e) {
        console.error("Failed to load places:", e);
        Alert.alert(
          t("error") || "Error",
          t("failed_to_load_places") || "Failed to load places. Please check your connection and try again."
        );
      }
    }
    load();
  }, [t]);

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

  const refreshPassengerLatestRide = useCallback(async () => {
    if (!userId) {
      setPassengerRideLatest(null);
      return;
    }
    try {
      const row = await getRegularLatestRideRequest(userId);
      setPassengerRideLatest(row);
    } catch {
      setPassengerRideLatest(null);
    }
  }, [userId]);

  const hasBlockingPassengerRide =
    passengerRideLatest != null && isActiveBlockingRideStatus(passengerRideLatest.status);

  /** Refresh driver markers and center the map on the user (helps testing / visibility). */
  const focusNearbyDriversOnMap = useCallback(() => {
    void refreshNearbyDrivers();
    if (userLocation && cameraRef.current) {
      cameraRef.current.setCamera({
        centerCoordinate: [userLocation.lon, userLocation.lat],
        zoomLevel: 14,
        animationDuration: 900,
      });
    }
  }, [refreshNearbyDrivers, userLocation]);

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
    if (!isPickingMapDestination || userLocation == null || !cameraRef.current) return;
    const timer = setTimeout(() => {
      try {
        cameraRef.current.setCamera({
          centerCoordinate: [userLocation.lon, userLocation.lat],
          zoomLevel: 15.25,
          animationDuration: 720,
        });
      } catch {
        /* ignore */
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [isPickingMapDestination, userLocation]);

  useEffect(() => {
    if (!userId || !userLocation) return;
    const interval = setInterval(() => {
      void refreshNearbyDrivers();
    }, RIDE_STATUS_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [userId, userLocation, refreshNearbyDrivers]);

  useEffect(() => {
    void refreshPassengerLatestRide();
  }, [refreshPassengerLatestRide]);

  useEffect(() => {
    if (!userId) return;
    const interval = setInterval(() => {
      void refreshPassengerLatestRide();
    }, RIDE_STATUS_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [userId, refreshPassengerLatestRide]);

  useFocusEffect(
    useCallback(() => {
      void refreshPassengerLatestRide();
    }, [refreshPassengerLatestRide])
  );

  // Handle selectedPlaceId from navigation params (from SavedPlacesScreen)
  useEffect(() => {
    if (selectedPlaceIdFromParams && places.length > 0) {
      const place = places.find(p => p.id === selectedPlaceIdFromParams);
      if (place) {
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

  // Reset translation states when place changes
  useEffect(() => {
    setOpeningHoursExpanded(false);
    // Reset translation states
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
    if (announcementIsTranslated) {
      // Toggle back to original
      setAnnouncementIsTranslated(false);
      return;
    }
    setLanguageSelectorType("announcement");
    setShowLanguageSelector(true);
  };

  // Open language selector for description
  const handleTranslateDescriptionClick = () => {
    if (descriptionIsTranslated) {
      // Toggle back to original
      setDescriptionIsTranslated(false);
      return;
    }
    setLanguageSelectorType("description");
    setShowLanguageSelector(true);
  };

  // Handle language selection and translation
  const handleLanguageSelection = async (targetLang: "ar" | "he") => {
    if (!languageSelectorType) return;
    
    setShowLanguageSelector(false);
    
    if (languageSelectorType === "announcement") {
      if (!selectedPlace?.announcement) return;
      
      // If already translated to this language, just show it
      if (announcementTranslated && announcementTargetLang === targetLang) {
        setAnnouncementIsTranslated(true);
        return;
      }

      setAnnouncementTranslating(true);
      try {
        const result = await translateText(selectedPlace.announcement, targetLang);
        setAnnouncementTranslated(result.translated_text);
        setAnnouncementTargetLang(targetLang);
        setAnnouncementIsTranslated(true);
      } catch (error: any) {
        Alert.alert(
          t("error") || "שגיאה",
          error.message || t("translation_failed") || "נכשל בתרגום"
        );
      } finally {
        setAnnouncementTranslating(false);
      }
    } else if (languageSelectorType === "description") {
      if (!selectedPlace?.description) return;
      
      // If already translated to this language, just show it
      if (descriptionTranslated && descriptionTargetLang === targetLang) {
        setDescriptionIsTranslated(true);
        return;
      }

      setDescriptionTranslating(true);
      try {
        const result = await translateText(selectedPlace.description, targetLang);
        setDescriptionTranslated(result.translated_text);
        setDescriptionTargetLang(targetLang);
        setDescriptionIsTranslated(true);
      } catch (error: any) {
        Alert.alert(
          t("error") || "שגיאה",
          error.message || t("translation_failed") || "נכשל בתרגום"
        );
      } finally {
        setDescriptionTranslating(false);
      }
    }
    
    setLanguageSelectorType(null);
  };

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

  /**
   * Group nearby drivers into singles/clusters/spread items so overlapping
   * markers don't obscure each other. Anchor latitude is the user's location
   * when we have it (most drivers render around them), otherwise the map's
   * initial center — either is accurate enough for meters-per-pixel math.
   */
  const driverMapItems = useMemo(() => {
    if (nearbyDrivers.length === 0) return [];
    const anchorLat = userLocation?.lat ?? INITIAL_CENTER[1];
    return clusterNearbyDrivers(nearbyDrivers, currentZoom, anchorLat);
  }, [nearbyDrivers, currentZoom, userLocation?.lat]);

  /**
   * Tapping a cluster badge zooms the camera in by a couple of levels centered
   * on the cluster. As meters-per-pixel shrinks the cluster naturally splits
   * into individual markers on the next render cycle.
   */
  const handleClusterTap = useCallback(
    (lat: number, lon: number) => {
      if (!cameraRef.current) return;
      cameraRef.current.setCamera({
        centerCoordinate: [lon, lat],
        zoomLevel: zoomInTargetForCluster(currentZoom),
        animationDuration: 500,
      });
    },
    [currentZoom]
  );

  // Handle map long press (drop custom pin for destination)
  const handleMapLongPress = async (e: any) => {
    try {
      const coords = e?.geometry?.coordinates;
      if (Array.isArray(coords) && coords.length >= 2) {
        const [lon, lat] = coords;
        const ok = await assertDestinationInServiceCities(lat, lon, t);
        if (!ok) return;

        setCustomPin({ lat, lon });
        setDestination({ lat, lon, name: t("map_selected_destination_label") });
        setSelectedPlace(null);
        setSearchResults([]);
        setIsPickingMapDestination(false);
      }
    } catch (error) {
      console.error("Error handling long press:", error);
    }
  };

  // Handle place marker tap - set as destination
  const dismissPlaceDetailsPanel = useCallback(() => {
    setSelectedPlace((prev) => {
      setDestination((d) => destinationAfterClosingPlaceDetails(d, prev));
      return null;
    });
  }, []);

  const handlePlaceTap = async (place: PlaceForMap) => {
    if (!place.location) return;
    
    // Places from database are already validated, so we can use them directly
    // Only check boundary for custom pins (long press on map)
    setSelectedPlace(place);
    setDestination({
      lat: place.location.lat,
      lon: place.location.lon,
      name: getPlaceName(place),
    });
    setCustomPin(null);
    setSearchResults([]);
    if (cameraRef.current) {
      cameraRef.current.setCamera({
        centerCoordinate: [place.location.lon, place.location.lat],
        zoomLevel: 16.5,
        animationDuration: 700,
      });
    }
  };

  /** Same matching rules as the map search bar; reused for ride destination search. */
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

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (!query || query.trim().length === 0) {
      setSearchResults([]);
      return;
    }
    if (!places?.length) {
      setSearchResults([]);
      return;
    }
    setSearchResults(filterPlacesByQuery(query));
  };

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

  const getRoute = async () => {
    await openDrivingRoutePreview({
      navigation,
      destination,
      t,
      setRouteLoading,
      setUserLocation,
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
      setSelectedPlace(null);
      setSearchResults([]);
      const dest = { lat, lon, name: t("map_selected_destination_label") };
      setCustomPin(null);
      setDestination(dest);
      setRideDestinationInput(dest.name || "");
      if (rideMapPickSkipRouteRef.current) {
        rideMapPickSkipRouteRef.current = false;
        const pending = pendingRideDriverRef.current;
        pendingRideDriverRef.current = null;
        if (pending) {
          setSelectedDriver(pending);
        }
      } else {
        await openDrivingRoutePreview({
          navigation,
          destination: dest,
          t,
          setRouteLoading,
          setUserLocation,
        });
      }
    } finally {
      pickMapTapInFlightRef.current = false;
    }
  };

  const handleCreateRideRequest = async (overrides?: { passengers?: number }) => {
    if (!userId || !selectedDriver) {
      return;
    }
    if (hasBlockingPassengerRide) {
      Alert.alert(t("ride_active_request_title"), t("ride_active_request_message"), [{ text: t("ok") || "OK" }]);
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
        Alert.alert(t("error"), t("ride_location_unavailable_hint"));
      } else if (missingDest) {
        Alert.alert(t("error"), t("ride_destination_required") || t("ride_destination_input_placeholder"));
      }
      return;
    }
    if (!userPhone) {
      Alert.alert(t("error"), t("ride_phone_required"));
      return;
    }

    // Final destination rule: must be inside one of the 3 supported service cities.
    // Pickup / driver / user live locations are intentionally NOT validated here —
    // drivers and passengers can be anywhere; only the final destination is constrained.
    // We only re-check when we actually have coordinates (some manual / text-only
    // destinations bypass coords and remain server-validated by destination_text fallback).
    if (
      destination &&
      typeof destination.lat === "number" &&
      typeof destination.lon === "number"
    ) {
      const ok = await assertDestinationInServiceCities(
        destination.lat,
        destination.lon,
        t
      );
      if (!ok) {
        return;
      }
    }

    // Popup-driven counts take priority; fall back to the screen-level state so
    // legacy code paths (e.g. map-pick destination) keep working unchanged.
    const passengersFromPopup =
      overrides?.passengers != null && Number.isFinite(overrides.passengers)
        ? Math.max(1, Math.min(12, Math.trunc(overrides.passengers)))
        : null;
    const passengers = passengersFromPopup ?? ridePassengers;
    if (passengers <= 0) {
      Alert.alert(t("error"), t("ride_invalid_people_or_seats"));
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
    if (__DEV__) {
      console.log("[ride] POST /rides/requests payload", JSON.stringify(payload));
    }
    try {
      await createRideRequest(payload);
      setRideSendErrorHint(null);
      setSelectedDriver(null);
      void refreshPassengerLatestRide();
      Alert.alert(t("success"), t("ride_request_sent"));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const short = msg.length > 180 ? `${msg.slice(0, 177)}…` : msg;
      setRideSendErrorHint(short || null);
      const key = rideApiDetailToTranslationKey(msg);
      Alert.alert(t("error"), key ? t(key) : t("ride_failed_create_request"), [{ text: t("ok") || "OK" }]);
    } finally {
      setCreatingRideRequest(false);
    }
  };

  const handleRideWithDriverFromPlaceDetails = async () => {
    if (!userId) {
      Alert.alert(t("error"), t("ride_session_invalid"));
      return;
    }
    if (hasBlockingPassengerRide) {
      Alert.alert(t("ride_active_request_title"), t("ride_active_request_message"), [{ text: t("ok") || "OK" }]);
      return;
    }
    if (!userLocation) {
      Alert.alert(t("error"), t("ride_location_unavailable_hint"));
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
        Alert.alert(t("error"), t("ride_no_drivers_nearby"));
        return;
      }
      // Focus the map on the fetched drivers so every available driver is visible.
      // Users then tap any driver marker to open the compact info popup — no
      // more full-screen form modal or list picker in this flow.
      focusNearbyDriversOnMap();
      if (drivers.length === 1) {
        // UX shortcut when there is only one option — open their popup directly.
        setSelectedDriver(drivers[0]);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const key = rideApiDetailToTranslationKey(msg);
      Alert.alert(t("error"), key ? t(key) : t("ride_failed_load_requests"), [{ text: t("ok") || "OK" }]);
    } finally {
      setRideWithDriverLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <MapView
        style={styles.map}
        mapStyle={MAP_STYLE_URL}
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
              handlePlaceTap(nearestPlace);
              return;
            }

            // Fallback: driver markers are intentionally small, so a near-miss
            // tap should still hit them. Hit-test against the clustered items
            // (singles/spread → open popup, cluster → zoom in).
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

        {/* User Location Marker — hidden while picking so the first tap hits the map, not the annotation */}
        {userLocation && !isPickingMapDestination && (
          <PointAnnotation id="user_location" coordinate={[userLocation.lon, userLocation.lat]}>
            <View style={styles.userLocationMarker}>
              <View style={styles.userLocationDot} />
            </View>
          </PointAnnotation>
        )}

        {isPickingMapDestination && pickPreviewCoords && (
          <PointAnnotation
            id="map_pick_preview"
            coordinate={[pickPreviewCoords.lon, pickPreviewCoords.lat]}
          >
            <View style={styles.customPinMarker} accessibilityLabel={t("map_pick_preview_label")}>
              <View style={styles.customPinDot} />
            </View>
          </PointAnnotation>
        )}

        {/* Custom Pin Marker (destination from long-press) */}
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

        {!isPickingMapDestination &&
          places.map((place) => {
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

        {/*
          Drivers render last so they sit above place pins (MapLibre draw order).
          `driverMapItems` clusters overlapping drivers so the user never sees a
          single icon standing in for several; tapping a cluster zooms in.
        */}
        {driverMapItems.map((item) => {
          if (item.type === "cluster") {
            const emphasized = item.drivers.some(
              (d) => d.driver_user_id === selectedDriver?.driver_user_id
            );
            return (
              <PointAnnotation
                key={item.id}
                id={item.id}
                coordinate={[item.lon, item.lat]}
                onSelected={() => handleClusterTap(item.lat, item.lon)}
              >
                <View
                  accessibilityRole="button"
                  accessibilityLabel={
                    t("map_driver_cluster_label", { count: item.drivers.length }) ||
                    `${item.drivers.length} nearby drivers`
                  }
                >
                  <RideDriverClusterMarker
                    count={item.drivers.length}
                    emphasized={emphasized}
                  />
                </View>
              </PointAnnotation>
            );
          }

          // Both singles and spread-out near-identical drivers render the same
          // marker; `spread` items just have slightly offset coordinates.
          const driver = item.driver;
          const isSelected = selectedDriver?.driver_user_id === driver.driver_user_id;
          const size: "compact" | "expanded" = isSelected ? "expanded" : "compact";
          return (
            <PointAnnotation
              key={item.id}
              id={item.id}
              coordinate={[item.lon, item.lat]}
              onSelected={() => setSelectedDriver(driver)}
            >
              <View
                accessibilityRole="button"
                accessibilityLabel={t("map_nearby_drivers_chip")}
              >
                <RideDriverMapMarker size={size} />
              </View>
            </PointAnnotation>
          );
        })}
      </MapView>

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
          handlePlaceTap(place);
          setSearchQuery("");
        }}
        emptyHint={t("start_typing_to_search") || "Start typing to search places..."}
        noResultsText={t("no_places_found") || "No places found"}
        onSearchFocus={dismissPlaceDetailsPanel}
        secondaryRow={
          <TouchableOpacity
            style={styles.mapNearbyDriversChip}
            onPress={focusNearbyDriversOnMap}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t("map_nearby_drivers_chip")}
          >
            <Ionicons name="car-sport" size={18} color="#0f5b63" />
            <Text style={styles.mapNearbyDriversChipText}>{t("map_nearby_drivers_chip")}</Text>
          </TouchableOpacity>
        }
      />

      <TouchableOpacity
        style={[styles.pickDestinationFab, isPickingMapDestination && styles.pickDestinationFabActive]}
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

      {isPickingMapDestination && (
        <View style={styles.pickDestinationBanner} pointerEvents="box-none">
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
              
              {/* Start Navigation — fresh GPS + destination validation + route preview */}
              {destination && (
                <View style={styles.actionButtonsNavRideWrap}>
                  <TouchableOpacity
                    style={[styles.actionButtonPrimary, styles.actionButtonPrimaryHalf]}
                    onPress={getRoute}
                    disabled={routeLoading || rideWithDriverLoading}
                  >
                    {routeLoading ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Ionicons name="navigate-outline" size={20} color="#FFFFFF" />
                        <Text style={styles.actionButtonPrimaryText} numberOfLines={1}>
                          {t("start_navigation") || "Start Navigation"}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.actionButtonRideWithDriver,
                      styles.actionButtonPrimaryHalf,
                      hasBlockingPassengerRide && styles.actionButtonRideWithDriverMuted,
                    ]}
                    onPress={handleRideWithDriverFromPlaceDetails}
                    disabled={rideWithDriverLoading}
                  >
                    {rideWithDriverLoading ? (
                      <ActivityIndicator size="small" color="#0f5b63" />
                    ) : (
                      <>
                        <Ionicons
                          name="car-sport"
                          size={20}
                          color={hasBlockingPassengerRide ? "#999" : "#0f5b63"}
                        />
                        <Text
                          style={[
                            styles.actionButtonRideWithDriverText,
                            hasBlockingPassengerRide && styles.actionButtonRideWithDriverTextMuted,
                          ]}
                          numberOfLines={2}
                        >
                          {t("ride_with_driver_button")}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
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
              return null;
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
                    Linking.openURL(url).catch(() => {
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
            </ScrollView>
          </>
        </Animated.View>
      )}

      {/* Compact, map-anchored driver info popup (replaces legacy form modal + list picker). */}
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
        onRequestClose={() => setShowLanguageSelector(false)}
      >
        <TouchableOpacity
          style={styles.languageSelectorModalOverlay}
          activeOpacity={1}
          onPress={() => setShowLanguageSelector(false)}
        >
          <View style={styles.languageSelectorModal}>
            <Text style={styles.languageSelectorTitle}>
              {i18n.language === "ar" ? "اختر اللغة" : "בחר שפה"}
            </Text>
            <TouchableOpacity
              style={styles.languageOption}
              onPress={() => handleLanguageSelection("he")}
            >
              <Text style={styles.languageOptionText}>עברית</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.languageOption}
              onPress={() => handleLanguageSelection("ar")}
            >
              <Text style={styles.languageOptionText}>العربية</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.languageSelectorCancel}
              onPress={() => setShowLanguageSelector(false)}
            >
              <Text style={styles.languageSelectorCancelText}>
                {i18n.language === "ar" ? "إلغاء" : "ביטול"}
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Photo Gallery Full Screen Modal */}
      {selectedPlace && (() => {
        const uniqueImages = collectBusinessImageUrls(
          selectedPlace.business_images_urls,
          selectedPlace.main_image_url
        );

        if (uniqueImages.length === 0) return null;

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
                {uniqueImages.map((imageUri, index) => {
                  const formattedUri = formatApiImageUri(imageUri);
                  if (!formattedUri) return null;
                  return (
                    <View key={`modal-image-${index}-${imageUri?.substring(0, 20) || index}`} style={styles.photoModalImageContainer}>
                      <Image
                        source={{ uri: formattedUri }}
                        style={styles.photoModalImage}
                        resizeMode="contain"
                        onError={(e) => {
                          if (__DEV__) {
                            console.error(`Modal image ${index} failed:`, {
                              original: imageUri,
                              formatted: formattedUri,
                              error: e?.nativeEvent?.error || e
                            });
                          }
                        }}
                        onLoad={() => {
                          if (__DEV__) {
                            console.log(`✅ Modal image ${index} loaded:`, formattedUri);
                          }
                        }}
                      />
                    </View>
                  );
                })}
              </ScrollView>
              <View style={styles.photoCounter}>
                <Text style={styles.photoCounterText}>
                  {selectedPhotoIndex + 1} / {uniqueImages.length}
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
  mapNearbyDriversChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#FFFFFF",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(15,91,99,0.22)",
    gap: 6,
  },
  mapNearbyDriversChipText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0f5b63",
  },
  pickDestinationFab: {
    position: "absolute",
    left: 20,
    bottom: 100,
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
    bottom: 168,
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
    borderColor: "#0f5b63",
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
  translateButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#0f5b63",
  },
  translateButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  announcementText: {
    fontSize: 15,
    color: "#000",
    lineHeight: 22,
    fontWeight: "400",
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
  actionButtonsNavRideWrap: {
    flex: 1.5,
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
  },
  actionButtonPrimaryHalf: {
    flex: 1,
    minWidth: 0,
  },
  actionButtonRideWithDriver: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderRadius: 24,
    paddingVertical: 10,
    paddingHorizontal: 8,
    gap: 6,
    borderWidth: 2,
    borderColor: "#0f5b63",
  },
  actionButtonRideWithDriverText: {
    fontSize: 12,
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
    backgroundColor: "#F2F2F7",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E5E5EA",
    borderStyle: "dashed",
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
  photoContainer: {
    width: "100%",
    height: "100%",
    position: "relative",
  },
  photoErrorPlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: "#f5f5f5",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 12,
  },
  photoErrorText: {
    fontSize: 10,
    color: "#999",
    marginTop: 4,
    textAlign: "center",
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
  socialLinkTouchable: {
    flex: 1,
  },
  socialLinkText: {
    fontSize: 15,
    color: "#0f5b63",
    textDecorationLine: "underline",
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