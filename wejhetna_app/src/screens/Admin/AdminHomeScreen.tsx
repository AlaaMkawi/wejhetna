// src/screens/AdminHomeScreen.tsx

import React, { useCallback, useEffect, useState, useRef } from "react";
import { appAlert } from "../../utils/appAlert";
import { View, StyleSheet, Text, TouchableOpacity, Platform, StatusBar, Dimensions, ScrollView, Image, PanResponder, Modal, ActivityIndicator, Linking, DeviceEventEmitter } from "react-native";
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
import { useRoute, useNavigation, useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { fetchAllPlaces, PlaceForMap, savePlace, unsavePlace, checkIfPlaceSaved, translateText, Category } from "../../api/places";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Ionicons from 'react-native-vector-icons/Ionicons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import i18n from "../../i18n";
import { useTranslation } from "react-i18next";
import { API_BASE_URL } from "../../../config";
import { useOverlayBottomOffset } from "../../theme/safeArea";
import { useInitialMapGeolocation } from "../../hooks/useInitialMapGeolocation";
import { collectBusinessImageUrls, formatApiImageUri } from "../../utils/imageUrl";
import MapInlineSearch from "../../components/map/MapInlineSearch";
import { runOpenDrivingRoutePreviewFromHome } from "../../utils/homeMapRoutePreview";
import { assertDestinationInServiceCities } from "../../utils/destinationBoundaryValidation";
import { useHomeMapDraftNavigationCleanup } from "../../hooks/useHomeMapDraftNavigationCleanup";
import { useRegularHomeMapCamera } from "../../hooks/useRegularHomeMapCamera";
import { getCurrentPositionReliable } from "../../utils/locationPermission";
import {
  destinationAfterClosingPlaceDetails,
  shouldShowCustomMapPin,
  shouldShowDestinationMapPin,
} from "../../utils/placeDetailsMapPin";
import { zoomInTargetForCluster } from "../../utils/nearbyDriverClustering";
import { PlaceDetailsActionButtons } from "../../components/place/PlaceDetailsActionButtons";
import { PlaceDetailsManageActions } from "../../components/place/PlaceDetailsManageActions";
import { useSyncPlaceDetailsDestination } from "../../hooks/useSyncPlaceDetailsDestination";
import { sharePlace } from "../../utils/sharePlace";
import { MapPickedDestinationPanel } from "../../components/map/MapPickedDestinationPanel";
import {
  getOpeningHoursStatusText,
  isBusinessOpenNow,
  parseOpeningHoursForDisplay,
} from "../../utils/placeDetailsOpeningHoursDisplay";

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
const getCategoryName = (category: Category): string => {
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

export default function AdminHomeScreen() {
  const { t } = useTranslation();
  const mapPickFabBottom = useOverlayBottomOffset(MAP_PICK_DEST_FAB_BOTTOM);
  const mapPickBannerBottom = useOverlayBottomOffset(MAP_PICK_DEST_BANNER_BOTTOM);
  const mapLocateMeFabBottom = useOverlayBottomOffset(MAP_LOCATE_ME_FAB_BOTTOM);
  const route = useRoute();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const cameraRef = useRef<any>(null);
  const placeCameraFocusedIdRef = useRef<number | null>(null);

  // Get selectedPlaceId from route params (if navigating from SavedPlacesScreen)
  const selectedPlaceIdFromParams = (route.params as any)?.selectedPlaceId as number | undefined;

  const [places, setPlaces] = useState<PlaceForMap[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<PlaceForMap | null>(null);
  const selectedPlaceIdRef = useRef<number | null>(null);
  const [, setLoadingPlaces] = useState(false);
  const [, setError] = useState<string | null>(null);
  const [isPlaceSaved, setIsPlaceSaved] = useState(false);
  const [savingPlace, setSavingPlace] = useState(false);
  const [userId, setUserId] = useState<number | null>(null);

  const [markerZoom, setMarkerZoom] = useState(INITIAL_ZOOM);
  
  // Photo gallery modal
  const [photoModalVisible, setPhotoModalVisible] = useState(false);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  const photoScrollViewRef = useRef<ScrollView>(null);

  // Ref for ScrollView to reset scroll position when place changes
  const scrollViewRef = useRef<ScrollView>(null);

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

  // Image error handling states
  const [imageErrors, setImageErrors] = useState<{ [key: number]: boolean }>({});
  const [imageLoading, setImageLoading] = useState<{ [key: number]: boolean }>({});
  const [openingHoursExpanded, setOpeningHoursExpanded] = useState(false);

  // GPS Location
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [hasShownLocationPermissionMessage, setHasShownLocationPermissionMessage] = useState(false);
  

  // Destination
  const [destination, setDestination] = useState<{ lat: number; lon: number; name?: string } | null>(null);

  useSyncPlaceDetailsDestination(selectedPlace, destination, setDestination, getPlaceName);
  const [customPin, setCustomPin] = useState<{ lat: number; lon: number } | null>(null);

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
      selectedPlaceIdRef.current = null;
      setSelectedPlace(null);
      setDestination(null);
      setCustomPin(null);
      setSearchResults([]);
      setPickPreviewCoords(null);
      setIsPickingMapDestination(false);
    },
  });

  // Handle image load error
  const handleImageError = (error: any, index: number, allImages: string[]) => {
    const originalUri = allImages[index];
    const formattedUri = formatApiImageUri(originalUri);
    console.warn(`Image ${index} failed to load:`, {
      original: originalUri,
      formatted: formattedUri,
      error: error?.nativeEvent?.error || error,
      errorMessage: error?.nativeEvent?.error?.message || "Unknown error"
    });
    setImageErrors((prev) => ({ ...prev, [index]: true }));
    setImageLoading((prev) => ({ ...prev, [index]: false }));
  };

  // Handle image load success
  const handleImageLoad = (index: number) => {
    setImageLoading((prev) => ({ ...prev, [index]: false }));
    setImageErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors[index];
      return newErrors;
    });
  };

  // Handle image load start
  const handleImageLoadStart = (index: number) => {
    setImageLoading((prev) => ({ ...prev, [index]: true }));
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

  useHomeMapDraftNavigationCleanup({
    setRouteLoading,
    setDestination,
    setCustomPin,
    setIsPickingMapDestination,
    setPickPreviewCoords,
    pickMapTapInFlightRef,
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
    // Reset translation states
    setAnnouncementTranslated(null);
    setAnnouncementIsTranslated(false);
    setAnnouncementTargetLang(null);
    setDescriptionTranslated(null);
    setDescriptionIsTranslated(false);
    setDescriptionTargetLang(null);
    setShowLanguageSelector(false);
    setLanguageSelectorType(null);
    // Reset image errors and loading states when place changes
    setImageErrors({});
    setImageLoading({});
    setOpeningHoursExpanded(false);
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
        if (result && result.translated_text) {
          setAnnouncementTranslated(result.translated_text);
          setAnnouncementTargetLang(targetLang);
          setAnnouncementIsTranslated(true);
        } else {
          throw new Error(t("translation_failed") || "Translation failed: No result received");
        }
      } catch (error: any) {
        console.error("Translation error:", error);
        appAlert(
          t("error") || "שגיאה",
          error?.message || t("translation_failed") || "נכשל בתרגום. אנא ודא שהשרת רץ ונסה שוב."
        );
        setAnnouncementIsTranslated(false);
        setAnnouncementTranslated(null);
        setAnnouncementTargetLang(null);
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
        if (result && result.translated_text) {
          setDescriptionTranslated(result.translated_text);
          setDescriptionTargetLang(targetLang);
          setDescriptionIsTranslated(true);
        } else {
          throw new Error(t("translation_failed") || "Translation failed: No result received");
        }
      } catch (error: any) {
        console.error("Translation error:", error);
        appAlert(
          t("error") || "שגיאה",
          error?.message || t("translation_failed") || "נכשל בתרגום. אנא ודא שהשרת רץ ונסה שוב."
        );
        setDescriptionIsTranslated(false);
        setDescriptionTranslated(null);
        setDescriptionTargetLang(null);
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

  const handleSharePlace = async () => {
    if (!selectedPlace) return;
    try {
      await sharePlace(selectedPlace);
    } catch {
      appAlert(
        t("error") || "שגיאה",
        t("share_failed") || "לא ניתן לשתף את המקום"
      );
    }
  };

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

  const dismissPlaceDetailsPanel = React.useCallback(() => {
    selectedPlaceIdRef.current = null;
    placeCameraFocusedIdRef.current = null;
    setSelectedPlace((prev) => {
      setDestination((d) => destinationAfterClosingPlaceDetails(d, prev));
      return null;
    });
  }, []);

  const dismissPickedDestinationPanel = useCallback(() => {
    setCustomPin(null);
    setDestination(null);
  }, []);

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
        handlePlaceMarkerPress(place);
      }
    }
  }, [selectedPlaceIdFromParams, places, handlePlaceMarkerPress]);

  const showCustomPinOnMap = shouldShowCustomMapPin(customPin, selectedPlace);
  const showDestinationPinOnMap = shouldShowDestinationMapPin(
    destination,
    customPin,
    selectedPlace
  );

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

  const getRoute = async () => {
    await runOpenDrivingRoutePreviewFromHome({
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
      selectedPlaceIdRef.current = null;
      setSelectedPlace(null);
      setSearchResults([]);
      const dest = { lat, lon, name: t("map_selected_destination_label") };
      setCustomPin(null);
      setDestination(dest);
      await runOpenDrivingRoutePreviewFromHome({
        navigation,
        destination: dest,
        t,
        setRouteLoading,
        setUserLocation,
      });
    } finally {
      pickMapTapInFlightRef.current = false;
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

  // Load places on mount and when screen is focused
  useFocusEffect(
    React.useCallback(() => {
      async function load() {
        try {
          setLoadingPlaces(true);
          setError(null);
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
            const place = data.find((p) => p.id === placeIdToSelect);
            if (place) {
              selectedPlaceIdRef.current = place.id;
              if (selectedPlaceIdFromParams && place.location) {
                handlePlaceMarkerPress(place);
              } else {
                setSelectedPlace(place);
              }
            }
          }
        } catch (e) {
          console.error(e);
          setError("Failed to load places");
        } finally {
          setLoadingPlaces(false);
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

  // Note: selectedPlaceId handling is now done in useFocusEffect above

  const handleDeletePlace = async () => {
    if (!selectedPlace) return;

    appAlert(
      "מחיקת מקום",
      `האם אתה בטוח שברצונך למחוק את המקום "${selectedPlace.name}"?`,
      [
        {
          text: "ביטול",
          style: "cancel",
        },
        {
          text: "מחק",
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
              appAlert("הצלחה", "המקום נמחק בהצלחה");
            } catch (error: any) {
              appAlert("שגיאה", error.message || "Failed to delete place");
            }
          },
        },
      ]
    );
  };

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
        topOffset={Platform.OS === "ios" ? 132 : 108}
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

      <View style={styles.topGlassBar}>
        <View>
          <Text style={styles.headerTitle}>Negev Community</Text>
          <Text style={styles.headerSubtitle}>
            {places.length} מקומות ביישובי הנגב
          </Text>
        </View>
      </View>

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
              }}
              style={styles.pickDestinationCancelBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.pickDestinationCancelText}>{t("map_pick_destination_cancel")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <Animated.View 
        style={[styles.bottomSheetContainer, bottomSheetAnimatedStyle]}
        pointerEvents={selectedPlace ? "auto" : "none"}
      >
      {selectedPlace && (
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
                <TouchableOpacity
                  style={styles.headerIconButton}
                  onPress={() => void handleSharePlace()}
                >
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

              {/* Open/Closed Status */}
              {(selectedPlace.place_type === "BUSINESS" || selectedPlace.opening_hours) && (
                <View style={styles.statusRow}>
                  {selectedPlace.opening_hours ? (
                    <View style={[
                      styles.statusBadge,
                      isBusinessOpenNow(selectedPlace.opening_hours) 
                        ? styles.statusBadgeOpen 
                        : styles.statusBadgeClosed
                    ]}>
                      <Text style={[
                        styles.statusText,
                        isBusinessOpenNow(selectedPlace.opening_hours) 
                          ? styles.statusTextOpen 
                          : styles.statusTextClosed
                      ]}>
                        {isBusinessOpenNow(selectedPlace.opening_hours) 
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

            <PlaceDetailsActionButtons
              hasDestination={!!destination}
              showRideWithDriver={false}
              routeLoading={routeLoading}
              isPlaceSaved={isPlaceSaved}
              savingPlace={savingPlace}
              canSave={!!userId}
              onShare={() => void handleSharePlace()}
              onToggleSave={() => void handleToggleSave()}
              onStartNavigation={() => void getRoute()}
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
              const uniqueImages = collectBusinessImageUrls(
                selectedPlace.business_images_urls,
                selectedPlace.main_image_url
              );

              // Debug logging
              if (__DEV__ && uniqueImages.length > 0) {
                console.log("=== LOADING PLACE IMAGES ===");
                console.log("Raw business_images_urls:", selectedPlace.business_images_urls, "Type:", typeof selectedPlace.business_images_urls);
                console.log("Raw main_image_url:", selectedPlace.main_image_url);
                console.log("Filtered unique images:", uniqueImages);
                console.log("API_BASE_URL:", API_BASE_URL);
                uniqueImages.forEach((img, idx) => {
                  const formatted = formatApiImageUri(img);
                  console.log(`Image ${idx}:`, {
                    original: img,
                    formatted: formatted,
                    isValid: formatted && formatted.startsWith('http')
                  });
                  // Test if URL is accessible (only in dev mode to avoid performance issues)
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
                console.log("===========================");
              }

              if (uniqueImages.length > 0) {
                return (
                  <View style={styles.imageGalleryContainer}>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={true}
                      contentContainerStyle={styles.imageScrollContent}
                      style={styles.imageScrollView}
                    >
                      {uniqueImages.map((imageUri, index) => {
                        const hasError = imageErrors[index];
                        const isLoading = imageLoading[index];
                        const formattedUri = formatApiImageUri(imageUri);
                        
                        // Always render - let Image component handle invalid URIs
                        return (
                          <TouchableOpacity
                            key={`image-${index}-${imageUri?.substring(0, 20) || index}`}
                            onPress={() => {
                              setSelectedPhotoIndex(index);
                              setPhotoModalVisible(true);
                              // Scroll to selected photo after modal opens
                              setTimeout(() => {
                                photoScrollViewRef.current?.scrollTo({
                                  x: index * SCREEN_WIDTH,
                                  animated: false,
                                });
                              }, 100);
                            }}
                            style={styles.imageGridItem}
                            activeOpacity={0.8}
                          >
                            {!formattedUri ? (
                              <View style={styles.photoErrorPlaceholder}>
                                <Ionicons name="image-outline" size={32} color="#999" />
                                <Text style={styles.photoErrorText} numberOfLines={2}>
                                  {t("invalid_image_url") || "Invalid URL"}
                                </Text>
                              </View>
                            ) : hasError ? (
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
                                  style={styles.gridImage}
                                  resizeMode="cover"
                                  onError={(e) => {
                                    if (__DEV__) {
                                      console.error(`❌ Image ${index} failed:`, {
                                        original: imageUri,
                                        formatted: formattedUri,
                                        error: e?.nativeEvent?.error || e,
                                        errorCode: e?.nativeEvent?.error?.code,
                                        errorMessage: e?.nativeEvent?.error?.message
                                      });
                                      // Try to fetch the URL to see if it's accessible
                                      fetch(formattedUri, { method: 'HEAD' })
                                        .then(res => {
                                          console.log(`🔍 Fetch test for ${formattedUri}:`, res.status, res.statusText, res.headers.get('content-type'));
                                        })
                                        .catch(err => {
                                          console.error(`🔍 Fetch test failed for ${formattedUri}:`, err.message);
                                        });
                                    }
                                    handleImageError(e, index, uniqueImages);
                                  }}
                                  onLoad={() => {
                                    if (__DEV__) {
                                      console.log(`✅ Image ${index} loaded successfully:`, formattedUri);
                                    }
                                    handleImageLoad(index);
                                  }}
                                  onLoadStart={() => {
                                    if (__DEV__) {
                                      console.log(`🔄 Image ${index} loading:`, formattedUri);
                                    }
                                    handleImageLoadStart(index);
                                  }}
                                />
                                {isLoading && (
                                  <View style={styles.photoLoadingOverlay}>
                                    <ActivityIndicator size="small" color="#fff" />
                                  </View>
                                )}
                              </View>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                );
              } else {
                return null; // Don't show anything if no images
              }
            })()}

            {/* Details Section - Card Style */}
            <View style={styles.detailsSection}>
              {selectedPlace.opening_hours && (
                <TouchableOpacity
                  style={styles.detailCard}
                  onPress={() => setOpeningHoursExpanded(!openingHoursExpanded)}
                  activeOpacity={0.7}
                >
                  <View style={styles.detailCardContent}>
                    <Ionicons name="time-outline" size={20} color="#000" />
                    <View style={styles.detailCardTextContainer}>
                      <Text
                        style={[
                          styles.detailCardStatus,
                          !isBusinessOpenNow(selectedPlace.opening_hours) &&
                            styles.detailCardStatusClosed,
                        ]}
                      >
                        {isBusinessOpenNow(selectedPlace.opening_hours)
                          ? i18n.language === "ar"
                            ? "مفتوح"
                            : "פתוח"
                          : getOpeningHoursStatusText(selectedPlace.opening_hours)}
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
                      {parseOpeningHoursForDisplay(selectedPlace.opening_hours).map(
                        (dayInfo, index) => (
                          <View
                            key={index}
                            style={[
                              styles.openingHoursRow,
                              dayInfo.isToday && styles.openingHoursRowToday,
                            ]}
                          >
                            <Text
                              style={[
                                styles.openingHoursDay,
                                dayInfo.isToday && styles.openingHoursDayToday,
                              ]}
                            >
                              {dayInfo.day}
                            </Text>
                            <Text
                              style={[
                                styles.openingHoursTime,
                                !dayInfo.hours && styles.openingHoursClosed,
                              ]}
                            >
                              {dayInfo.hours ||
                                (i18n.language === "ar" ? "مغلق" : "סגור")}
                            </Text>
                          </View>
                        )
                      )}
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
              showEdit={!selectedPlace.owner_user_id}
              showDelete={!selectedPlace.owner_user_id}
              onEdit={() => {
                if (selectedPlace && userId) {
                  navigation.navigate("ManageMyBusiness", {
                    fromMap: true,
                    adminPlaceId: selectedPlace.id,
                    adminUserId: userId ?? undefined,
                  });
                }
              }}
              onDelete={handleDeletePlace}
              infoMessage={
                selectedPlace.owner_user_id
                  ? t("place_has_owner_cannot_edit") ||
                    "למקום זה יש בעל עסק - לא ניתן לערוך"
                  : null
              }
            />
            </ScrollView>
          </>
      )}
      </Animated.View>

      <MapPickedDestinationPanel
        visible={isPickedDestinationActive}
        onDismiss={dismissPickedDestinationPanel}
        onStartNavigation={() => void getRoute()}
        onRideWithDriver={() => {}}
        showRideWithDriver={false}
        navigationLoading={routeLoading}
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
                          // Don't show alert for every failed image, just log it
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
              {/* Photo counter */}
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

// --- סגנונות חדשים למראה של Google Maps ---

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

  // --- שאר הסגנונות ללא שינוי ---
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
  topGlassBar: {
    position: "absolute",
    top: Platform.OS === 'ios' ? 60 : 40,
    left: 16,
    right: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.9)", 
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,1)",
  },
  headerTitle: { fontSize: 17, fontWeight: "800", color: "#1D1D1F", letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 12, color: "#86868B", marginTop: 2, fontWeight: "500" },
  topButtonsRow: { flexDirection: "row" },
  glassButtonSmall: {
    backgroundColor: "#F2F2F7",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: "rgba(0,0,0,0.05)",
  },
  glassButtonText: { fontSize: 13, fontWeight: "600", color: "#007AFF" },
  fabButton: {
    position: "absolute", bottom: 30, alignSelf: "center", backgroundColor: "#1D1D1F", 
    flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 24, borderRadius: 32,
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 10,
  },
  fabIcon: { color: "#FFF", fontSize: 22, marginRight: 8, fontWeight: "300", marginTop: -2 },
  fabText: { color: "#FFF", fontSize: 15, fontWeight: "600" },
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
  statusRow: {
    marginTop: 12,
    marginBottom: 8,
  },
  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#E8F5E9",
  },
  statusBadgeOpen: {
    backgroundColor: "#E8F5E9",
  },
  statusBadgeClosed: {
    backgroundColor: "#FFEBEE",
  },
  statusText: {
    fontSize: 14,
    fontWeight: "600",
  },
  statusTextOpen: {
    color: "#4CAF50",
  },
  statusTextClosed: {
    color: "#F44336",
  },
  announcementBanner: {
    backgroundColor: "#FFF9E6",
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#FFE082",
  },
  announcementHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 8,
  },
  announcementTitle: {
    fontSize: 16,
    fontWeight: "700",
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
  announcementText: {
    fontSize: 15,
    color: "#000",
    lineHeight: 22,
    fontWeight: "400",
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F2F2F7",
    alignItems: "center",
    justifyContent: "center",
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
  userLocationMarker: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(15, 91, 99, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#0f5b63",
  },
  userLocationDot: {
    flex: 1,
    borderRadius: 7,
    backgroundColor: "#0f5b63",
    width: 14,
    height: 14,
  },
  customPinMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(255, 107, 107, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#ff6b6b",
  },
  customPinDot: {
    flex: 1,
    borderRadius: 9,
    backgroundColor: "#ff6b6b",
    width: 18,
    height: 18,
  },
  destinationMarker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(15, 91, 99, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#0f5b63",
  },
  destinationMarkerText: {
    fontSize: 24,
  },
});