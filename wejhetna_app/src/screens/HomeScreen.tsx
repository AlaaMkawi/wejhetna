import React from "react";
import { View, StyleSheet, TouchableOpacity, Text } from "react-native";
import { MapView, Camera } from "@maplibre/maplibre-react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { RootStackParamList } from "../navigation/types";

// טיפוס ניווט למסך ה־Home
type HomeScreenNavProp = NativeStackNavigationProp<RootStackParamList, "Home">;

const MAP_STYLE_URL =
  "https://api.maptiler.com/maps/streets-v2/style.json?key=Js2mV1WY15ayeXH6ceQP";

const INITIAL_CENTER: [number, number] = [34.8, 31.25]; // [lon, lat]
const INITIAL_ZOOM = 10;

export default function HomeScreen() {
  const navigation = useNavigation<HomeScreenNavProp>();

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

      {/* BUTTON TO SIGNUP */}
      <TouchableOpacity
        style={styles.signupButton}
        onPress={() => navigation.navigate("SignUp")}
      >
        <Text style={styles.signupText}>Sign Up</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },

  signupButton: {
    position: "absolute",
    bottom: 30,
    right: 20,
    backgroundColor: "#007AFF",
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
  },
  signupText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },
});
