import React from "react";
import { View, StyleSheet, Text, TouchableOpacity } from "react-native";
import { MapView, Camera } from "@maplibre/maplibre-react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";

const MAP_STYLE_URL =
  "https://api.maptiler.com/maps/streets-v2/style.json?key=Js2mV1WY15ayeXH6ceQP";

const INITIAL_CENTER: [number, number] = [34.8, 31.25]; // [lon, lat]
const INITIAL_ZOOM = 10;

type NavType = NativeStackNavigationProp<RootStackParamList>;

export default function AdminHomeScreen() {
  const navigation = useNavigation<NavType>();

  return (
    <View style={styles.container}>
      {/* MAP */}
      <MapView
        style={styles.map}
        mapStyle={MAP_STYLE_URL}
        zoomEnabled
        scrollEnabled
        rotateEnabled
        pitchEnabled
      >
        <Camera
          centerCoordinate={INITIAL_CENTER}
          zoomLevel={INITIAL_ZOOM}
          minZoomLevel={8}
          maxZoomLevel={17}
        />
      </MapView>

      {/* TITLE OVERLAY */}
      <View style={styles.adminOverlay}>
        <Text style={styles.adminTitle}>Admin Panel – Map</Text>
      </View>

      {/* BUTTON: CITIES */}
      <TouchableOpacity
        style={styles.cityButton}
        onPress={() => navigation.navigate("AdminCities")}
      >
        <Text style={styles.buttonText}>Cities</Text>
      </TouchableOpacity>

      {/* BUTTON: CATEGORIES */}
      <TouchableOpacity
        style={styles.categoryButton}
        onPress={() => navigation.navigate("AdminCategories")}
      >
        <Text style={styles.buttonText}>Categories</Text>
      </TouchableOpacity>

      {/* BUTTON: ADD PLACE FORM */}
      <TouchableOpacity
        style={styles.addPlaceButton}
        onPress={() => navigation.navigate("AdminPlaceForm")}
      >
        <Text style={styles.buttonText}>+ Add Place</Text>
      </TouchableOpacity>

      {/* BUTTON: PICK LOCATION ON MAP */}
      <TouchableOpacity
        style={styles.pickLocationButton}
        onPress={() =>
          navigation.navigate("AdminPlaceMapPicker", {
            initialLat: INITIAL_CENTER[1],
            initialLon: INITIAL_CENTER[0],
          })
        }
      >
        <Text style={styles.buttonText}>📍 Pick Location</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },

  adminOverlay: {
    position: "absolute",
    top: 40,
    left: 20,
    right: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 8,
  },
  adminTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },

  /* TOP BUTTONS */
  cityButton: {
    position: "absolute",
    top: 100,
    left: 20,
    backgroundColor: "#4C6FFF",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  categoryButton: {
    position: "absolute",
    top: 100,
    right: 20,
    backgroundColor: "#FF3B70",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
  },

  /* BOTTOM BUTTONS */
  addPlaceButton: {
    position: "absolute",
    bottom: 90,
    left: 20,
    backgroundColor: "#00897B",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  pickLocationButton: {
    position: "absolute",
    bottom: 90,
    right: 20,
    backgroundColor: "#6A1B9A",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },

  buttonText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "600",
  },
});