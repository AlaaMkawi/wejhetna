// src/screens/Admin/AdminPlaceMapPickerScreen.tsx

import React, { useState, useEffect } from "react";
import { View, StyleSheet, Text, Alert, TouchableOpacity, Platform, StatusBar } from "react-native";
import {
  MapView,
  Camera,
  PointAnnotation,
} from "@maplibre/maplibre-react-native";

import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Ionicons from 'react-native-vector-icons/Ionicons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTranslation } from "react-i18next";

import { RootStackParamList } from "../../navigation/types";

import {
  fetchAllPlaces,
  PlaceForMap,
  checkOsmForGps,
  checkLocationInServiceCities,
} from "../../api/places";

import { NativeGeolocation as Geolocation } from "../../utils/nativeGeolocation";
import i18n from "../../i18n";

const DARK_TEAL = "#0f5b63";

const MAP_STYLE_URL =
  "https://api.maptiler.com/maps/019b0319-f856-79df-b13b-917c4a28f9a8/style.json?key=Js2mV1WY15ayeXH6ceQP";

const INITIAL_ZOOM = 13;

// Zoom thresholds for displaying different types of places
// At zoom < 13: Only roads and city outlines (handled by MapTiler style)
// At zoom 13-14: Road names appear (handled by MapTiler style)
// At zoom 15-16.4: Only PUBLIC_SERVICE places appear with icons
// At zoom 16.5+: All places (PUBLIC_SERVICE + BUSINESS) appear with icons
const PUBLIC_SERVICE_ZOOM_THRESHOLD = 15; // Show public services (mosques, schools, clinics) at zoom 15+
const BUSINESS_ZOOM_THRESHOLD = 16.5; // Show businesses at zoom 16.5+ (only after public services are already visible)

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

type NavType = NativeStackNavigationProp<
  RootStackParamList,
  "AdminPlaceMapPicker"
>;
type AdminPlaceMapPickerRoute = RouteProp<
  RootStackParamList,
  "AdminPlaceMapPicker"
>;

type SourceType = "MAP_PICK" | "GPS_NO_OSM" | "GPS_WITH_OSM";

export default function AdminPlaceMapPickerScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavType>();
  const route = useRoute<AdminPlaceMapPickerRoute>();

  const { initialLat, initialLon, adminUserId, role } = route.params;

  const [selectedLat, setSelectedLat] = useState<number | null>(
    initialLat ?? 31.25
  );
  const [selectedLon, setSelectedLon] = useState<number | null>(
    initialLon ?? 34.8
  );

  const [selectedSource, setSelectedSource] =
    useState<SourceType>("MAP_PICK");
  const [selectedOsmId, setSelectedOsmId] = useState<string | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [existingPlaces, setExistingPlaces] = useState<PlaceForMap[]>([]);
  const [currentZoom, setCurrentZoom] = useState(INITIAL_ZOOM);
  const [detectedCityId, setDetectedCityId] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await fetchAllPlaces();
        setExistingPlaces(data);
      } catch (e) {
        console.log("Error loading existing places", e);
      }
    }
    load();
  }, []);

  const onRegionDidChange = async (feature: any) => {
    const newZoom = feature.properties.zoomLevel;
    setCurrentZoom(newZoom);
  };

  async function handleMapPress(e: any) {
    const coords = e?.geometry?.coordinates;
    if (Array.isArray(coords) && coords.length === 2) {
      const lon = coords[0];
      const lat = coords[1];
      
      // בדיקת boundaries
      try {
        const boundaryCheck = await checkLocationInServiceCities(lat, lon);
        if (!boundaryCheck.is_within) {
          Alert.alert(
            t("location_outside_service_area") || "מיקום מחוץ לאזור השירות",
            t("location_outside_service_area_message") || "ניתן להוסיף מקומות רק בתוך אחת מ-3 הערים: רהט, לקיה, תל שבע.\n\nאנא בחרי מיקום בתוך אחת מהערים.",
            [{ text: t("ok") || "אישור" }]
          );
          return;
        }
        
        // המיקום תקין - עדכון
        setSelectedLon(lon);
        setSelectedLat(lat);
        setSelectedSource("MAP_PICK");
        setSelectedOsmId(null);
        // שמירת city_id שנמצא
        if (boundaryCheck.city_id) {
          setDetectedCityId(boundaryCheck.city_id);
        }
        } catch (error) {
        console.error("Error checking boundary:", error);
        // אם יש שגיאה בבדיקה, עדיין מאפשרים לבחור (לא חוסמים)
        setSelectedLon(lon);
        setSelectedLat(lat);
      setSelectedSource("MAP_PICK");
      setSelectedOsmId(null);
        setDetectedCityId(null); // לא הצלחנו לזהות עיר
      }
    }
  }

  function handleUseMyLocation() {
    setGpsLoading(true);

    Geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;

        // בדיקת boundaries קודם
        try {
          const boundaryCheck = await checkLocationInServiceCities(latitude, longitude);
          if (!boundaryCheck.is_within) {
            Alert.alert(
              t("location_outside_service_area") || "מיקום מחוץ לאזור השירות",
              t("current_location_outside_service_area") || "ניתן להוסיף מקומות רק בתוך אחת מ-3 הערים: רהט, לקיה, תל שבע.\n\nהמיקום הנוכחי שלך נמצא מחוץ לאזור השירות.",
              [{ text: t("ok") || "אישור" }]
            );
            setGpsLoading(false);
            return;
          }
          // שמירת city_id שנמצא
          if (boundaryCheck.city_id) {
            setDetectedCityId(boundaryCheck.city_id);
          }
        } catch (error: any) {
          console.error("Error checking boundary:", error);
          // אם יש שגיאה בבדיקה, מציגים הודעה למשתמש
          const errorMessage = error?.message || t("unknown_error") || "שגיאה לא ידועה";
          Alert.alert(
            t("boundary_check_error") || "שגיאה בבדיקת גבולות",
            `${t("boundary_check_error_message") || "לא הצלחנו לבדוק את המיקום."} ${errorMessage}\n\n${t("please_ensure_server_running") || "אנא ודאי שהשרת רץ ונסה שוב."}`,
            [
              {
                text: t("continue_anyway") || "המשך בכל זאת",
                onPress: () => {
                  // ממשיכים גם אם יש שגיאה
                },
              },
              {
                text: t("cancel") || "ביטול",
                style: "cancel",
                onPress: () => {
                  setGpsLoading(false);
                  return;
                },
              },
            ]
          );
          // אם המשתמש בחר "המשך בכל זאת", נמשיך
          // אחרת, נחזור מהפונקציה
        }

        setSelectedLat(latitude);
        setSelectedLon(longitude);
        setSelectedSource("GPS_NO_OSM");
        setSelectedOsmId(null);
        // העיר כבר נשמרה ב-boundaryCheck.city_id למעלה

        // בדיקת OSM ברקע - ללא הודעות למשתמש
        try {
          const result = await checkOsmForGps(latitude, longitude);

          if (result.match_found && result.osm_id) {
            // מצאנו מקום ב-OSM - שמירה שקטה ללא הודעה
                    setSelectedSource("GPS_WITH_OSM");
                    setSelectedOsmId(result.osm_id || null);
          } else {
            // לא נמצא מקום - נשאר עם GPS_NO_OSM (כבר מוגדר)
                    setSelectedSource("GPS_NO_OSM");
                    setSelectedOsmId(null);
          }
        } catch (err) {
          // שגיאה בבדיקת OSM - ממשיכים עם GPS בלבד (ללא הודעה)
          console.log("GPS / OSM CHECK ERROR", err);
          setSelectedSource("GPS_NO_OSM");
          setSelectedOsmId(null);
        } finally {
          setGpsLoading(false);
        }
      },
      (error) => {
        console.log("GPS error", error);
        Alert.alert(
          t("location_error") || "שגיאה במיקום",
          t("failed_to_read_location") || "לא הצלחנו לקרוא את המיקום מהמכשיר."
        );
        setGpsLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 10000,
      }
    );
  }

  async function handleConfirm() {
    if (selectedLat == null || selectedLon == null) {
      Alert.alert(
        t("error") || "שגיאה",
        t("please_select_location") || "אנא בחר מיקום על המפה או השתמש במיקום הנוכחי."
      );
      return;
    }

    // בדיקת boundaries לפני אישור
    try {
      const boundaryCheck = await checkLocationInServiceCities(
        selectedLat,
        selectedLon
      );

      if (!boundaryCheck.is_within) {
        Alert.alert(
          t("location_outside_service_area") || "מיקום מחוץ לאזור השירות",
          t("location_outside_service_area_message") || "ניתן להוסיף מקומות רק בתוך אחת מ-3 הערים: רהט, לקיה, תל שבע.\n\nאנא בחרי מיקום אחר.",
          [{ text: t("ok") || "אישור" }]
        );
        return;
      }

      // המיקום תקין - המשך לטופס
      // אם לא זיהינו עיר עדיין, ננסה שוב
      const finalCityId = detectedCityId || boundaryCheck.city_id;
      
      if (!finalCityId) {
        Alert.alert(
          t("error") || "שגיאה",
          t("failed_to_detect_city") || "לא הצלחנו לזהות את העיר. אנא נסה שוב.",
          [{ text: t("ok") || "אישור" }]
        );
        return;
      }

    navigation.navigate("AdminPlaceForm", {
      pickedLat: selectedLat,
      pickedLon: selectedLon,
      pickedSource: selectedSource,
      pickedOsmId: selectedOsmId,
        detectedCityId: finalCityId,
        adminUserId,
        role,
      });
    } catch (error: any) {
      console.error("Error checking city boundary:", error);
      const errorMessage = error?.message || t("unknown_error") || "שגיאה לא ידועה";
      Alert.alert(
        t("boundary_check_error") || "שגיאה בבדיקת גבולות",
        `${t("boundary_check_error_message") || "לא הצלחנו לבדוק את המיקום."} ${errorMessage}\n\n${t("please_ensure_server_running") || "אנא ודאי שהשרת רץ ונסה שוב."}`,
        [
          {
            text: t("continue_anyway") || "המשך בכל זאת",
            onPress: () => {
              // ממשיכים גם אם יש שגיאה (ללא city_id)
              navigation.navigate("AdminPlaceForm", {
                pickedLat: selectedLat,
                pickedLon: selectedLon,
                pickedSource: selectedSource,
                pickedOsmId: selectedOsmId,
                detectedCityId: detectedCityId || undefined,
      adminUserId,
      role,
    });
            },
          },
          {
            text: t("cancel") || "ביטול",
            style: "cancel",
          },
        ]
      );
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-forward" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.title}>{t("select_location_on_map") || "בחירת מיקום על המפה"}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.mapContainer}>
        <MapView
          style={StyleSheet.absoluteFill}
          mapStyle={MAP_STYLE_URL}
          onPress={handleMapPress}
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
            defaultSettings={{
              centerCoordinate: [
                initialLon ?? selectedLon ?? 34.8,
                initialLat ?? selectedLat ?? 31.25,
              ],
              zoomLevel: INITIAL_ZOOM,
            }}
          />

          {existingPlaces.map((place) => {
            if (!place.location) return null;
            
            const placeIcon = getPlaceIcon(place);
            
            // Determine visibility based on zoom level and place type
            let shouldShow = false;
            let shouldShowLabel = false;
            
            if (place.place_type === 'PUBLIC_SERVICE') {
              shouldShow = currentZoom >= PUBLIC_SERVICE_ZOOM_THRESHOLD;
              shouldShowLabel = currentZoom >= PUBLIC_SERVICE_ZOOM_THRESHOLD;
            } else if (place.place_type === 'BUSINESS') {
              shouldShow = currentZoom >= BUSINESS_ZOOM_THRESHOLD;
              shouldShowLabel = currentZoom >= BUSINESS_ZOOM_THRESHOLD;
            }
            
            if (!shouldShow) return null;

            return (
              <PointAnnotation
                key={place.id}
                id={`existing_${place.id}`}
                coordinate={[place.location.lon, place.location.lat]}
              >
                <View style={styles.nativeMarkerContainer}>
                  {/* Icon/Marker based on place type - Google Maps style */}
                  {place.place_type === 'PUBLIC_SERVICE' ? (
                    <View style={styles.publicServiceMarker}>
                      <View style={styles.pinContainer}>
                        <View style={[styles.iconContainer, { backgroundColor: placeIcon.color }]}>
                          {placeIcon.type === 'mosque' && (
                            <MaterialCommunityIcons name="mosque" size={18} color="#FFFFFF" />
                          )}
                          {placeIcon.type === 'school' && (
                            <Ionicons name="school" size={18} color="#FFFFFF" />
                          )}
                          {placeIcon.type === 'clinic' && (
                            <MaterialCommunityIcons name="hospital-building" size={18} color="#FFFFFF" />
                          )}
                          {placeIcon.type === 'kindergarten' && (
                            <MaterialCommunityIcons name="baby-face-outline" size={18} color="#FFFFFF" />
                          )}
                          {placeIcon.type === 'community' && (
                            <MaterialCommunityIcons name="account-group" size={18} color="#FFFFFF" />
                          )}
                          {placeIcon.type === 'public' && (
                            <Ionicons name="location" size={18} color="#FFFFFF" />
                          )}
                        </View>
                        <View style={[styles.pinPoint, { borderTopColor: placeIcon.color }]} />
                      </View>
                    </View>
                  ) : (
                    <View style={styles.businessMarker}>
                      <View style={styles.pinContainer}>
                        <View style={[styles.iconContainer, { backgroundColor: placeIcon.color }]}>
                          <Ionicons name="business" size={16} color="#FFFFFF" />
                        </View>
                        <View style={[styles.pinPoint, { borderTopColor: placeIcon.color }]} />
                      </View>
                    </View>
                  )}

                  {/* Label with icon - Google Maps style */}
                  {shouldShowLabel && (
                    <View style={styles.labelWrapper}>
                      <View style={styles.labelContent}>
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

          {selectedLat != null && selectedLon != null && (
            <PointAnnotation
              id="selected_point"
              coordinate={[selectedLon, selectedLat]}
            >
              <View style={styles.selectedDot} />
            </PointAnnotation>
          )}
        </MapView>
      </View>

      <View style={styles.bottomPanel}>
        <View style={styles.buttonsRow}>
          <TouchableOpacity
            style={[styles.secondaryButton, gpsLoading && styles.buttonDisabled]}
              onPress={handleUseMyLocation}
              disabled={gpsLoading}
          >
            <Ionicons 
              name="location" 
              size={20} 
              color={DARK_TEAL} 
              style={styles.buttonIcon}
            />
            <Text style={styles.secondaryButtonText}>
              {gpsLoading ? (t("loading_location") || "טוען מיקום...") : (t("my_location") || "המיקום שלי")}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleConfirm}
          >
            <Text style={styles.primaryButtonText}>{t("confirm_location") || "אישור מיקום"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  container: { 
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 50 : 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  backButton: {
    padding: 4,
    marginRight: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    flex: 1,
    textAlign: "center",
    marginTop: 6,
    color: "#1A1A1A",
  },
  headerSpacer: {
    width: 40, // Same width as back button to center title
  },
  mapContainer: { 
    flex: 1,
  },
  bottomPanel: {
    padding: 16,
    borderTopWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#fff",
    paddingBottom: Platform.OS === 'ios' ? 30 : 16,
  },
  buttonsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  primaryButton: {
    flex: 1,
    paddingVertical: 18,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: DARK_TEAL,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  secondaryButton: {
    flex: 1,
    paddingVertical: 18,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: "rgba(15, 91, 99, 0.3)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    flexDirection: "row",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonIcon: {
    marginRight: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  secondaryButtonText: {
    color: DARK_TEAL,
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  // --- עיצוב markers בסגנון Google Maps ---
  nativeMarkerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  publicServiceMarker: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  businessMarker: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  pinContainer: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
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
  selectedDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#ED1C7B",
    borderWidth: 2,
    borderColor: "#fff",
  },
});
