// src/screens/businessOwner/BusinessOwnerPickLocationScreen.tsx

import React, { useState } from "react";
import { View, StyleSheet, Text, Alert, TouchableOpacity, Platform, StatusBar } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  MapView,
  Camera,
  PointAnnotation,
} from "@maplibre/maplibre-react-native";
import { useTranslation } from "react-i18next";
import { useRoute, useNavigation, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Ionicons from "react-native-vector-icons/Ionicons";

import { RootStackParamList } from "../../navigation/types";
import { checkNearbyForOwner } from "../../api/businessOwnerApi";
import { checkLocationInServiceCities } from "../../api/places";
import { NativeGeolocation as Geolocation } from "../../utils/nativeGeolocation";

const DARK_TEAL = "#0f5b63";

const MAP_STYLE_URL =
  "https://api.maptiler.com/maps/019b0319-f856-79df-b13b-917c4a28f9a8/style.json?key=Js2mV1WY15ayeXH6ceQP";

type BusinessOwnerPickLocationRoute = RouteProp<
  RootStackParamList,
  "BusinessOwnerPickLocation"
>;

export default function BusinessOwnerPickLocationScreen() {
  const { t } = useTranslation();
  const route = useRoute<BusinessOwnerPickLocationRoute>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();

  // personalInfo will be passed to details form and used to create user
  const { personalInfo } = route.params;

  const [selectedLat, setSelectedLat] = useState<number | null>(31.25);
  const [selectedLon, setSelectedLon] = useState<number | null>(34.8);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [checkingNearby, setCheckingNearby] = useState(false);
  const [detectedCityId, setDetectedCityId] = useState<number | null>(null);

  async function handleMapPress(e: any) {
    const coords = e?.geometry?.coordinates;
    if (Array.isArray(coords) && coords.length === 2) {
      const lon = coords[0];
      const lat = coords[1];
      
      // בדיקת גבולות הערים
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
        // שמירת city_id שנמצא
        if (boundaryCheck.city_id) {
          setDetectedCityId(boundaryCheck.city_id);
        }
      } catch (error) {
        console.error("Error checking boundary:", error);
        // אם יש שגיאה בבדיקה, עדיין מאפשרים לבחור (לא חוסמים)
        setSelectedLon(lon);
        setSelectedLat(lat);
        setDetectedCityId(null); // לא הצלחנו לזהות עיר
      }
    }
  }

  async function handleUseMyLocation() {
    setGpsLoading(true);

    Geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        
        // בדיקת גבולות הערים קודם
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
            [{ text: t("ok") || "אישור" }]
          );
          setGpsLoading(false);
          return;
        }
        
        setSelectedLat(latitude);
        setSelectedLon(longitude);
        setGpsLoading(false);

        // Automatically check nearby and navigate
        try {
          setCheckingNearby(true);
          const nearbyResult = await checkNearbyForOwner(latitude, longitude);

          if (nearbyResult.status === "HAS_OWNER") {
            Alert.alert(
              "Location Already Claimed",
              "This location already has a business owner. Please select a different location."
            );
          } else if (nearbyResult.status === "CAN_CLAIM" && nearbyResult.candidate) {
            Alert.alert(
              "Existing Place Found",
              `Found an existing place: ${nearbyResult.candidate.name}. You can claim this place.`,
              [
                {
                  text: "Claim This Place",
                  onPress: () => {
                    navigation.navigate("BusinessOwnerDetailsForm", {
                      personalInfo,
                      lat: latitude,
                      lon: longitude,
                      source: "GPS_WITH_OSM",
                      osmId: null,
                      existingPlaceId: nearbyResult.candidate?.place_id || null,
                      detectedCityId: detectedCityId,
                    });
                  },
                },
                {
                  text: t("create_new_place") || "Create New Place",
                  style: "cancel",
                  onPress: () => {
                    navigation.navigate("BusinessOwnerDetailsForm", {
                      personalInfo,
                      lat: latitude,
                      lon: longitude,
                      source: "GPS_NO_OSM",
                      osmId: null,
                      existingPlaceId: null,
                      detectedCityId: detectedCityId,
                    });
                  },
                },
              ]
            );
          } else {
            // NO_PLACE - can create new place
            navigation.navigate("BusinessOwnerDetailsForm", {
              personalInfo,
              lat: latitude,
              lon: longitude,
              source: "GPS_NO_OSM",
              osmId: null,
              existingPlaceId: null,
              detectedCityId: detectedCityId,
            });
          }
        } catch (err: any) {
          console.log("checkNearbyForOwner error:", err?.response?.data || err?.message);
          Alert.alert(
            t("error") || "Error",
            err?.response?.data?.detail || t("could_not_check_nearby") || "Could not check nearby places"
          );
        } finally {
          setCheckingNearby(false);
        }
      },
      (error) => {
        console.log("GPS error", error);
        Alert.alert(t("error") || "Error", t("could_not_get_location") || "Could not get your location");
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
      Alert.alert(t("error") || "Error", t("please_select_location") || "Please select a location");
      return;
    }

    // בדיקת גבולות הערים לפני המשך
    try {
      const boundaryCheck = await checkLocationInServiceCities(selectedLat, selectedLon);
      if (!boundaryCheck.is_within) {
        Alert.alert(
          t("location_outside_service_area") || "מיקום מחוץ לאזור השירות",
          t("location_outside_service_area_message") || "ניתן להוסיף מקומות רק בתוך אחת מ-3 הערים: רהט, לקיה, תל שבע.\n\nאנא בחרי מיקום אחר.",
          [{ text: t("ok") || "אישור" }]
        );
        return;
      }
      // אם לא זיהינו עיר עדיין, ננסה שוב
      const finalCityId = detectedCityId || boundaryCheck.city_id;
      if (finalCityId) {
        setDetectedCityId(finalCityId);
      }
    } catch (error: any) {
      console.error("Error checking city boundary:", error);
      const errorMessage = error?.message || t("unknown_error") || "שגיאה לא ידועה";
      Alert.alert(
        t("boundary_check_error") || "שגיאה בבדיקת גבולות",
        `${t("boundary_check_error_message") || "לא הצלחנו לבדוק את המיקום."} ${errorMessage}\n\n${t("please_ensure_server_running") || "אנא ודאי שהשרת רץ ונסה שוב."}`,
        [{ text: t("ok") || "אישור" }]
      );
      return;
    }

    try {
      setCheckingNearby(true);
      const nearbyResult = await checkNearbyForOwner(selectedLat, selectedLon);

      if (nearbyResult.status === "HAS_OWNER") {
        Alert.alert(
          "Location Already Claimed",
          "This location already has a business owner. Please select a different location."
        );
      } else if (nearbyResult.status === "CAN_CLAIM" && nearbyResult.candidate) {
        Alert.alert(
          "Existing Place Found",
          `Found an existing place: ${nearbyResult.candidate.name}. You can claim this place.`,
          [
            {
              text: "Claim This Place",
              onPress: () => {
                navigation.navigate("BusinessOwnerDetailsForm", {
                  personalInfo,
                  lat: selectedLat,
                  lon: selectedLon,
                  source: "MAP_PICK",
                  osmId: null,
                  existingPlaceId: nearbyResult.candidate?.place_id || null,
                  detectedCityId: detectedCityId,
                });
              },
            },
            {
              text: t("create_new_place") || "Create New Place",
              style: "cancel",
              onPress: () => {
                navigation.navigate("BusinessOwnerDetailsForm", {
                  personalInfo,
                  lat: selectedLat,
                  lon: selectedLon,
                  source: "MAP_PICK",
                  osmId: null,
                  existingPlaceId: null,
                  detectedCityId: detectedCityId,
                });
              },
            },
          ]
        );
      } else {
        // NO_PLACE - can create new place
        navigation.navigate("BusinessOwnerDetailsForm", {
          personalInfo,
          lat: selectedLat,
          lon: selectedLon,
          source: "MAP_PICK",
          osmId: null,
          existingPlaceId: null,
          detectedCityId: detectedCityId,
        });
      }
    } catch (err: any) {
      console.log("checkNearbyForOwner error:", err?.response?.data || err?.message);
      Alert.alert(
        t("error") || "Error",
        err?.response?.data?.detail || t("could_not_check_nearby") || "Could not check nearby places"
      );
    } finally {
      setCheckingNearby(false);
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      {/* Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, Platform.OS === 'ios' ? 50 : 16) + 8 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            if (navigation.canGoBack()) {
              navigation.goBack();
            }
          }}
          activeOpacity={0.7}
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
          scrollEnabled={true}
          rotateEnabled={false}
          pitchEnabled={false}
          logoEnabled={false}
          attributionEnabled={false}
        >
          <Camera
            defaultSettings={{
              centerCoordinate: [
                selectedLon ?? 34.8,
                selectedLat ?? 31.25,
              ],
              zoomLevel: 13,
            }}
          />

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
            style={[styles.secondaryButton, (gpsLoading || checkingNearby) && styles.buttonDisabled]}
            onPress={handleUseMyLocation}
            disabled={gpsLoading || checkingNearby}
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
            style={[styles.primaryButton, (checkingNearby || selectedLat == null || selectedLon == null) && styles.buttonDisabled]}
            onPress={handleConfirm}
            disabled={checkingNearby || selectedLat == null || selectedLon == null}
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
  selectedDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#ED1C7B",
    borderWidth: 2,
    borderColor: "#fff",
  },
});

