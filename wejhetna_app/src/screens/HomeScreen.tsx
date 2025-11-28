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

  const handleSignUp = () => {
    navigation.navigate("SignUp");
  };

  const handleAdminLogin = () => {
    navigation.navigate("AdminLogin");
  };

  const handleRegularLogin = () => {
    navigation.navigate("UserLogin", { mode: "REGULAR" });
  };

  const handleDriverLogin = () => {
    navigation.navigate("UserLogin", { mode: "DRIVER" });
  };

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

      {/* SIGN UP BUTTON */}
      <TouchableOpacity style={styles.signupButton} onPress={handleSignUp}>
        <Text style={styles.signupText}>Sign Up</Text>
      </TouchableOpacity>

      {/* ADMIN LOGIN BUTTON */}
      <TouchableOpacity style={styles.adminButton} onPress={handleAdminLogin}>
        <Text style={styles.adminText}>Admin</Text>
      </TouchableOpacity>

      {/* REGULAR LOGIN BUTTON */}
      <TouchableOpacity
        style={styles.regularLoginButton}
        onPress={handleRegularLogin}
      >
        <Text style={styles.regularLoginText}>Regular Login</Text>
      </TouchableOpacity>

      {/* DRIVER LOGIN BUTTON */}
      <TouchableOpacity
        style={styles.driverLoginButton}
        onPress={handleDriverLogin}
      >
        <Text style={styles.driverLoginText}>Driver Login</Text>
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

  adminButton: {
    position: "absolute",
    bottom: 30,
    left: 20,
    backgroundColor: "#555",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  adminText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 14,
  },

  regularLoginButton: {
    position: "absolute",
    bottom: 80,
    right: 20,
    backgroundColor: "#34C759",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  regularLoginText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 14,
  },

  driverLoginButton: {
    position: "absolute",
    bottom: 130,
    right: 20,
    backgroundColor: "#FF9500",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  driverLoginText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 14,
  },
});
