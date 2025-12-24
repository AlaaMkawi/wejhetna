// src/screens/businessOwner/BusinessOwnerPickLocationScreen.tsx

import React, { useState } from "react";
import { View, StyleSheet, Text, Alert, ActivityIndicator, TouchableOpacity } from "react-native";
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
import Geolocation from "@react-native-community/geolocation";

const DARK_TEAL = "#0f5b63";
const SOFT_TEAL = "#3a8d96";
const MINT = "#9bd3d8";

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

  // personalInfo will be passed to details form and used to create user
  const { personalInfo } = route.params;

  const [selectedLat, setSelectedLat] = useState<number | null>(31.25);
  const [selectedLon, setSelectedLon] = useState<number | null>(34.8);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [checkingNearby, setCheckingNearby] = useState(false);

  function handleMapPress(e: any) {
    const coords = e?.geometry?.coordinates;
    if (Array.isArray(coords) && coords.length === 2) {
      setSelectedLon(coords[0]);
      setSelectedLat(coords[1]);
    }
  }

  async function handleUseMyLocation() {
    setGpsLoading(true);

    Geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
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
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={DARK_TEAL} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("pick_location") || "Pick Location"}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.mapContainer}>
        <MapView
          style={StyleSheet.absoluteFill}
          mapStyle={MAP_STYLE_URL}
          onPress={handleMapPress}
        >
          <Camera
            centerCoordinate={[
              selectedLon ?? 34.8,
              selectedLat ?? 31.25,
            ]}
            zoomLevel={13}
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

      {/* Bottom Panel with Design */}
      <View style={styles.bottomPanel}>
        <View style={styles.coordinatesContainer}>
          <Ionicons name="information-circle-outline" size={20} color={DARK_TEAL} />
          <Text style={styles.coordinatesText}>
            {selectedLat != null && selectedLon != null
              ? `${t("latitude") || "Lat"}: ${selectedLat.toFixed(5)}, ${t("longitude") || "Lon"}: ${selectedLon.toFixed(5)}`
              : t("tap_map_or_use_location") || "Tap on the map or use your location"}
          </Text>
        </View>

        <View style={styles.buttonsRow}>
          <TouchableOpacity
            style={[styles.actionButton, styles.myLocationButton, gpsLoading && styles.buttonDisabled]}
            onPress={handleUseMyLocation}
            disabled={gpsLoading || checkingNearby}
          >
            {gpsLoading ? (
              <ActivityIndicator color={DARK_TEAL} />
            ) : (
              <>
                <Ionicons name="location" size={20} color={DARK_TEAL} />
                <Text style={styles.myLocationButtonText}>
                  {t("my_location") || "My Location"}
                </Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.confirmButton, (checkingNearby || selectedLat == null || selectedLon == null) && styles.buttonDisabled]}
            onPress={handleConfirm}
            disabled={checkingNearby || selectedLat == null || selectedLon == null}
          >
            {checkingNearby ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.confirmButtonText}>
                {t("confirm_location") || "Confirm Location"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1,
    backgroundColor: "#fff",
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
  mapContainer: { 
    flex: 1,
  },
  bottomPanel: {
    padding: 16,
    borderTopWidth: 2,
    borderTopColor: MINT,
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  coordinatesContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f5fdff",
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#d6ebee",
  },
  coordinatesText: {
    marginLeft: 8,
    fontSize: 13,
    color: DARK_TEAL,
    flex: 1,
    textAlign: "right",
  },
  buttonsRow: {
    flexDirection: "row",
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 8,
  },
  myLocationButton: {
    backgroundColor: "#f5fdff",
    borderWidth: 2,
    borderColor: SOFT_TEAL,
  },
  myLocationButtonText: {
    color: DARK_TEAL,
    fontSize: 15,
    fontWeight: "600",
  },
  confirmButton: {
    backgroundColor: DARK_TEAL,
  },
  confirmButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  selectedDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#ED1C7B",
    borderWidth: 3,
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
});

