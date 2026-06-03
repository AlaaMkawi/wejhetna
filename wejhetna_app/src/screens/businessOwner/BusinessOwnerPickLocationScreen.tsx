// src/screens/businessOwner/BusinessOwnerPickLocationScreen.tsx

import React, { useCallback, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { appAlert } from "../../utils/appAlert";
import { View, StyleSheet, Text, TouchableOpacity, Platform, StatusBar } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Camera, PointAnnotation } from "@maplibre/maplibre-react-native";
import { FocusedMapView } from "../../components/map/FocusedMapView";
import { useMapScreenOverlays } from "../../components/map/useMapScreenOverlays";
import { useTranslation } from "react-i18next";
import { useRoute, useNavigation, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Ionicons from "react-native-vector-icons/Ionicons";

import { RootStackParamList } from "../../navigation/types";
import { checkNearbyForOwner } from "../../api/businessOwnerApi";
import { checkLocationInServiceCities, updatePlace } from "../../api/places";
import { NativeGeolocation as Geolocation } from "../../utils/nativeGeolocation";

const DARK_TEAL = "#0f5b63";

const MAP_STYLE_URL =
  "https://api.maptiler.com/maps/019b0319-f856-79df-b13b-917c4a28f9a8/style.json?key=Js2mV1WY15ayeXH6ceQP";

type BusinessOwnerPickLocationRoute = RouteProp<
  RootStackParamList,
  "BusinessOwnerPickLocation"
>;

export default function BusinessOwnerPickLocationScreen() {
  const { showOverlays, exitMapScreen } = useMapScreenOverlays();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const navigateAway = useCallback(
    <T extends keyof RootStackParamList>(name: T, params: RootStackParamList[T]) => {
      exitMapScreen(() => navigation.navigate(name, params));
    },
    [exitMapScreen, navigation]
  );
  const { t } = useTranslation();
  const route = useRoute<BusinessOwnerPickLocationRoute>();
  const insets = useSafeAreaInsets();

  const { personalInfo, editMode } = route.params;
  const isEditMode = editMode != null;

  const [selectedLat, setSelectedLat] = useState<number | null>(
    editMode?.initialLat ?? 31.25
  );
  const [selectedLon, setSelectedLon] = useState<number | null>(
    editMode?.initialLon ?? 34.8
  );
  const [gpsLoading, setGpsLoading] = useState(false);
  const [checkingNearby, setCheckingNearby] = useState(false);
  const [detectedCityId, setDetectedCityId] = useState<number | null>(null);

  const validateServiceBoundary = async (
    lat: number,
    lon: number
  ): Promise<number | null | false> => {
    try {
      const boundaryCheck = await checkLocationInServiceCities(lat, lon);
      if (!boundaryCheck.is_within) {
        appAlert(
          t("location_outside_service_area") || "מיקום מחוץ לאזור השירות",
          t("location_outside_service_area_message") ||
            "ניתן להוסיף מקומות רק בתוך אחת מ-3 הערים: רהט, לקיה, תל שבע.\n\nאנא בחרי מיקום אחר.",
          [{ text: t("ok") || "אישור" }]
        );
        return false;
      }
      const cityId = boundaryCheck.city_id ?? detectedCityId;
      if (cityId) {
        setDetectedCityId(cityId);
      }
      return cityId ?? null;
    } catch (error: any) {
      console.error("Error checking city boundary:", error);
      const errorMessage = error?.message || t("unknown_error") || "שגיאה לא ידועה";
      appAlert(
        t("boundary_check_error") || "שגיאה בבדיקת גבולות",
        `${t("boundary_check_error_message") || "לא הצלחנו לבדוק את המיקום."} ${errorMessage}\n\n${t("please_ensure_server_running") || "אנא ודאי שהשרת רץ ונסה שוב."}`,
        [{ text: t("ok") || "אישור" }]
      );
      return false;
    }
  };

  const PLACE_LOCATION_UPDATED_KEY = "placeLocationUpdated";

  const returnToManageScreen = useCallback(async () => {
    if (!editMode) return;
    await AsyncStorage.setItem(PLACE_LOCATION_UPDATED_KEY, String(editMode.placeId));
    exitMapScreen(() => {
      if (navigation.canGoBack()) {
        navigation.goBack();
      }
    });
  }, [editMode, exitMapScreen, navigation]);

  const saveEditedLocation = async (
    lat: number,
    lon: number,
    locationSource: string
  ) => {
    if (!editMode) return;
    const cityId = await validateServiceBoundary(lat, lon);
    if (cityId === false) return;

    try {
      setCheckingNearby(true);
      const nearbyResult = await checkNearbyForOwner(
        lat,
        lon,
        50,
        editMode.placeId
      );
      if (nearbyResult.status === "HAS_OWNER") {
        appAlert(
          t("error") || "שגיאה",
          t("location_already_claimed") ||
            "במיקום זה כבר קיים עסק עם בעלים. אנא בחרי מיקום אחר."
        );
        return;
      }
      if (
        nearbyResult.status === "CAN_CLAIM" &&
        nearbyResult.candidate &&
        nearbyResult.candidate.place_id !== editMode.placeId
      ) {
        appAlert(
          t("error") || "שגיאה",
          t("location_too_close_to_other_place") ||
            "במיקום זה קיים מקום אחר. אנא בחרי מיקום רחוק יותר."
        );
        return;
      }

      await updatePlace(editMode.placeId, {
        lat,
        lon,
        location_source: locationSource,
        editor_role: editMode.editorRole,
        editor_user_id: editMode.editorUserId,
        ...(cityId != null ? { city_id: cityId } : {}),
      });

      appAlert(
        t("success") || "הצלחה",
        t("location_updated_successfully") || "המיקום עודכן בהצלחה",
        [{ text: t("ok") || "אישור", onPress: returnToManageScreen }]
      );
    } catch (err: any) {
      appAlert(
        t("error") || "שגיאה",
        err?.message ||
          t("failed_to_update_location") ||
          "לא הצלחנו לעדכן את המיקום"
      );
    } finally {
      setCheckingNearby(false);
    }
  };

  const proceedSignupWithLocation = async (
    lat: number,
    lon: number,
    source: string
  ) => {
    if (!personalInfo) {
      appAlert(t("error") || "Error", t("unknown_error") || "Missing signup data");
      return;
    }

    try {
      setCheckingNearby(true);
      const nearbyResult = await checkNearbyForOwner(lat, lon);

      if (nearbyResult.status === "HAS_OWNER") {
        appAlert(
          "Location Already Claimed",
          "This location already has a business owner. Please select a different location."
        );
      } else if (nearbyResult.status === "CAN_CLAIM" && nearbyResult.candidate) {
        appAlert(
          "Existing Place Found",
          `Found an existing place: ${nearbyResult.candidate.name}. You can claim this place.`,
          [
            {
              text: "Claim This Place",
              onPress: () => {
                navigateAway("BusinessOwnerDetailsForm", {
                  personalInfo,
                  lat,
                  lon,
                  source,
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
                navigateAway("BusinessOwnerDetailsForm", {
                  personalInfo,
                  lat,
                  lon,
                  source,
                  osmId: null,
                  existingPlaceId: null,
                  detectedCityId: detectedCityId,
                });
              },
            },
          ]
        );
      } else {
        navigateAway("BusinessOwnerDetailsForm", {
          personalInfo,
          lat,
          lon,
          source,
          osmId: null,
          existingPlaceId: null,
          detectedCityId: detectedCityId,
        });
      }
    } catch (err: any) {
      console.log("checkNearbyForOwner error:", err?.response?.data || err?.message);
      appAlert(
        t("error") || "Error",
        err?.response?.data?.detail || t("could_not_check_nearby") || "Could not check nearby places"
      );
    } finally {
      setCheckingNearby(false);
    }
  };

  async function handleMapPress(e: any) {
    const coords = e?.geometry?.coordinates;
    if (Array.isArray(coords) && coords.length === 2) {
      const lon = coords[0];
      const lat = coords[1];

      try {
        const boundaryCheck = await checkLocationInServiceCities(lat, lon);
        if (!boundaryCheck.is_within) {
          appAlert(
            t("location_outside_service_area") || "מיקום מחוץ לאזור השירות",
            t("location_outside_service_area_message") ||
              "ניתן להוסיף מקומות רק בתוך אחת מ-3 הערים: רהט, לקיה, תל שבע.\n\nאנא בחרי מיקום בתוך אחת מהערים.",
            [{ text: t("ok") || "אישור" }]
          );
          return;
        }

        setSelectedLon(lon);
        setSelectedLat(lat);
        if (boundaryCheck.city_id) {
          setDetectedCityId(boundaryCheck.city_id);
        }
      } catch (error) {
        console.error("Error checking boundary:", error);
        setSelectedLon(lon);
        setSelectedLat(lat);
        setDetectedCityId(null);
      }
    }
  }

  async function handleUseMyLocation() {
    setGpsLoading(true);

    Geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;

        try {
          const boundaryCheck = await checkLocationInServiceCities(latitude, longitude);
          if (!boundaryCheck.is_within) {
            appAlert(
              t("location_outside_service_area") || "מיקום מחוץ לאזור השירות",
              t("current_location_outside_service_area") ||
                "ניתן להוסיף מקומות רק בתוך אחת מ-3 הערים: רהט, לקיה, תל שבע.\n\nהמיקום הנוכחי שלך נמצא מחוץ לאזור השירות.",
              [{ text: t("ok") || "אישור" }]
            );
            setGpsLoading(false);
            return;
          }
          if (boundaryCheck.city_id) {
            setDetectedCityId(boundaryCheck.city_id);
          }
        } catch (error: any) {
          console.error("Error checking boundary:", error);
          const errorMessage = error?.message || t("unknown_error") || "שגיאה לא ידועה";
          appAlert(
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

        if (isEditMode) {
          return;
        }

        await proceedSignupWithLocation(latitude, longitude, "GPS_NO_OSM");
      },
      (error) => {
        console.log("GPS error", error);
        appAlert(t("error") || "Error", t("could_not_get_location") || "Could not get your location");
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
      appAlert(t("error") || "Error", t("please_select_location") || "Please select a location");
      return;
    }

    if (isEditMode) {
      await saveEditedLocation(selectedLat, selectedLon, "MAP_PICK");
      return;
    }

    const cityId = await validateServiceBoundary(selectedLat, selectedLon);
    if (cityId === false) return;

    await proceedSignupWithLocation(selectedLat, selectedLon, "MAP_PICK");
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={[styles.header, { paddingTop: Math.max(insets.top, Platform.OS === "ios" ? 50 : 16) + 8 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            if (navigation.canGoBack()) {
              exitMapScreen(() => navigation.goBack());
            }
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-forward" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.title}>
          {isEditMode
            ? t("change_location") || "שנה מיקום"
            : t("select_location_on_map") || "בחירת מיקום על המפה"}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.mapContainer}>
        <FocusedMapView
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
              zoomLevel: isEditMode ? 16 : 13,
            }}
          />

          {showOverlays && selectedLat != null && selectedLon != null && (
            <PointAnnotation
              id="selected_point"
              coordinate={[selectedLon, selectedLat]}
            >
              <View style={styles.selectedDot} collapsable={false} />
            </PointAnnotation>
          )}
        </FocusedMapView>
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
            <Text style={styles.primaryButtonText}>
              {isEditMode
                ? t("save_location") || "שמור מיקום"
                : t("confirm_location") || "אישור מיקום"}
            </Text>
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
    width: 40,
  },
  mapContainer: {
    flex: 1,
  },
  bottomPanel: {
    padding: 16,
    borderTopWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#fff",
    paddingBottom: Platform.OS === "ios" ? 30 : 16,
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
