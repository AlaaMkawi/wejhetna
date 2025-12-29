// src/screens/DriverAccount/DriverHomeScreen.tsx

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
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { MapView, Camera, PointAnnotation } from "@maplibre/maplibre-react-native";
import { useRoute, RouteProp } from "@react-navigation/native";
import { fetchAllPlaces, PlaceForMap, savePlace, unsavePlace, checkIfPlaceSaved } from "../../api/places";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Ionicons from 'react-native-vector-icons/Ionicons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import i18n from "../../i18n";
import { useTranslation } from "react-i18next";

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

type Props = {
  navigation: any;
  route?: RouteProp<any, any>;
};

export default function DriverHomeScreen({ }: Props) {
  const { t } = useTranslation();
  const routeParams = useRoute();
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

  // Ref for ScrollView to reset scroll position when place changes
  const scrollViewRef = useRef<ScrollView>(null);

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

  // Fetch all places on mount
  useEffect(() => {
    async function load() {
      try {
        const data = await fetchAllPlaces();
        setPlaces(data);
      } catch (e) {
        console.error("Failed to load places:", e);
      }
    }
    load();
  }, []);

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

      <MapView
        style={styles.map}
        mapStyle={MAP_STYLE_URL}
        onRegionDidChange={onRegionDidChange}
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
                setSelectedPlace(place);
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

      {!selectedPlace && (
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
              onPress={() => setSelectedPlace(null)}
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
                <Text style={styles.bottomSheetSubtitle}>
                  {selectedPlace.place_type === "BUSINESS" 
                    ? t("business_type") || (i18n.language === "ar" ? "عمل" : "עסק")
                    : t("public") || (i18n.language === "ar" ? "عام" : "ציבורי")}
                </Text>
                {getCityName(selectedPlace.city) && (
                  <>
                    <Text style={styles.subtitleSeparator}> • </Text>
                    <Text style={styles.bottomSheetSubtitle}>
                      {getCityName(selectedPlace.city)}
                    </Text>
                  </>
                )}
              </View>
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
              <TouchableOpacity style={styles.actionButtonSecondary}>
                <Ionicons name="navigate-outline" size={20} color="#0f5b63" />
                <Text style={styles.actionButtonSecondaryText}>
                  {t("start") || "התחלה"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionButtonPrimary}>
                <Ionicons name="map-outline" size={20} color="#FFFFFF" />
                <Text style={styles.actionButtonPrimaryText}>
                  {t("route") || "מסלול"}
                </Text>
            </TouchableOpacity>
          </View>

            {/* Image Gallery */}
            <View style={styles.imageGalleryContainer}>
              <Text style={styles.sectionTitle}>
                {t("photos") || "תמונות"}
              </Text>
              {selectedPlace.main_image_url ? (
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={true}
                  contentContainerStyle={styles.imageGalleryScrollContent}
                >
                  <Image 
                    source={{ uri: selectedPlace.main_image_url }}
                    style={styles.galleryImage}
                    resizeMode="cover"
                  />
                </ScrollView>
              ) : (
                <View style={styles.noImagePlaceholder}>
                  <Ionicons name="image-outline" size={40} color="#999" />
                  <Text style={styles.noDataText}>
                    {t("no_photos") || "אין תמונות"}
                  </Text>
                </View>
              )}
            </View>

            {/* Details Section */}
            <View style={styles.detailsSection}>
              {/* Location */}
              <View style={styles.detailRow}>
                <Ionicons name="location-outline" size={20} color="#0f5b63" />
                <Text style={styles.detailText}>
                  {getCityName(selectedPlace.city) || t("no_data") || "אין נתונים"}
                </Text>
              </View>

              {/* Category */}
              <View style={styles.detailRow}>
                <MaterialCommunityIcons 
                  name={selectedPlace.category?.icon_name as any || "tag"} 
                  size={20} 
                  color="#0f5b63" 
                />
                <Text style={styles.detailText}>
                  {selectedPlace.category
                    ? (i18n.language === "he" && selectedPlace.category.name_he
                        ? selectedPlace.category.name_he
                        : i18n.language === "ar" && selectedPlace.category.name_ar
                        ? selectedPlace.category.name_ar
                        : selectedPlace.category.name_ar || selectedPlace.category.name_he || "")
                    : (t("no_data") || "אין נתונים")}
                </Text>
              </View>

              {/* Phone */}
              <View style={styles.detailRow}>
                <Ionicons name="call-outline" size={20} color="#0f5b63" />
                <Text style={[styles.detailText, !selectedPlace.phone && styles.noDataText]}>
                  {selectedPlace.phone || (t("no_data") || "אין נתונים")}
                </Text>
              </View>

              {/* Opening Hours */}
              <View style={styles.detailRow}>
                <Ionicons name="time-outline" size={20} color="#0f5b63" />
                <Text style={[styles.detailText, !selectedPlace.opening_hours && styles.noDataText]}>
                  {selectedPlace.opening_hours || (t("no_data") || "אין נתונים")}
                </Text>
              </View>

              {/* Description */}
              <View style={styles.descriptionSection}>
                <Text style={styles.descriptionTitle}>
                  {t("description") || "תיאור"}
                </Text>
                {selectedPlace.description ? (
                  <Text style={styles.descriptionText}>
                {selectedPlace.description}
              </Text>
                ) : (
                  <Text style={styles.noDataText}>
                    {t("no_data") || "אין נתונים"}
              </Text>
            )}
          </View>

              {/* Social Links */}
              <View style={styles.detailRow}>
                <Ionicons name="link-outline" size={20} color="#0f5b63" />
                <Text style={[styles.detailText, !selectedPlace.social_links && styles.noDataText]} numberOfLines={1}>
                  {selectedPlace.social_links || (t("no_data") || "אין נתונים")}
                </Text>
              </View>
            </View>
            </ScrollView>
          </>
        </Animated.View>
      )}
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
    backgroundColor: "#F2F2F7",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E5E5EA",
    borderStyle: "dashed",
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
  descriptionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
    marginBottom: 8,
  },
  descriptionText: {
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
});
