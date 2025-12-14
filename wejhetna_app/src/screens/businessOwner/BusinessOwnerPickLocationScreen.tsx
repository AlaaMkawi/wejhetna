// src/screens/businessOwner/BusinessOwnerPickLocationScreen.tsx

import React, { useState } from "react";
import { View, Button, StyleSheet, Text, Alert, ActivityIndicator } from "react-native";
import {
  MapView,
  Camera,
  PointAnnotation,
} from "@maplibre/maplibre-react-native";

import { useRoute, useNavigation, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { RootStackParamList } from "../../navigation/types";
import { checkNearbyForOwner } from "../../api/businessOwnerApi";
import Geolocation from "@react-native-community/geolocation";

const MAP_STYLE_URL =
  "https://api.maptiler.com/maps/019b0319-f856-79df-b13b-917c4a28f9a8/style.json?key=Js2mV1WY15ayeXH6ceQP";

type BusinessOwnerPickLocationRoute = RouteProp<
  RootStackParamList,
  "BusinessOwnerPickLocation"
>;

export default function BusinessOwnerPickLocationScreen() {
  const route = useRoute<BusinessOwnerPickLocationRoute>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  // userId will be used when submitting place request
  const { userId } = route.params;

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
                      userId,
                      lat: latitude,
                      lon: longitude,
                      source: "GPS_WITH_OSM",
                      osmId: null,
                      existingPlaceId: nearbyResult.candidate?.place_id || null,
                    });
                  },
                },
                {
                  text: "Create New Place",
                  style: "cancel",
                  onPress: () => {
                    navigation.navigate("BusinessOwnerDetailsForm", {
                      userId,
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
              userId,
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
            "Error",
            err?.response?.data?.detail || "Could not check nearby places"
          );
        } finally {
          setCheckingNearby(false);
        }
      },
      (error) => {
        console.log("GPS error", error);
        Alert.alert("Error", "Could not get your location");
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
      Alert.alert("Error", "Please select a location");
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
                  userId,
                  lat: selectedLat,
                  lon: selectedLon,
                  source: "MAP_PICK",
                  osmId: null,
                  existingPlaceId: nearbyResult.candidate?.place_id || null,
                });
              },
            },
            {
              text: "Create New Place",
              style: "cancel",
              onPress: () => {
                navigation.navigate("BusinessOwnerDetailsForm", {
                  userId,
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
          userId,
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
        "Error",
        err?.response?.data?.detail || "Could not check nearby places"
      );
    } finally {
      setCheckingNearby(false);
    }
  }

  return (
    <View style={styles.container}>
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

      <View style={styles.bottomPanel}>
        <Text style={styles.infoText}>
          {selectedLat != null && selectedLon != null
            ? `Lat: ${selectedLat.toFixed(5)}, Lon: ${selectedLon.toFixed(5)}`
            : "Tap on the map or use your location"}
        </Text>

        <View style={styles.buttonsRow}>
          <View style={styles.buttonWrapper}>
            <Button
              title={gpsLoading ? "Loading..." : "📍 My Location"}
              onPress={handleUseMyLocation}
              disabled={gpsLoading}
            />
          </View>

          <View style={styles.buttonWrapper}>
            {checkingNearby ? (
              <ActivityIndicator style={styles.loader} />
            ) : (
              <Button title="Confirm Location" onPress={handleConfirm} />
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  mapContainer: { flex: 1 },
  bottomPanel: {
    padding: 12,
    borderTopWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#fff",
  },
  infoText: {
    marginBottom: 8,
    textAlign: "center",
    fontSize: 14,
  },
  buttonsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  buttonWrapper: {
    flex: 1,
    marginHorizontal: 4,
  },
  loader: {
    padding: 10,
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

