// src/screens/Admin/AdminPlaceMapPickerScreen.tsx

import React, { useState } from "react";
import { View, Button, StyleSheet, Text } from "react-native";
import {
  MapView,
  Camera,
  PointAnnotation,
} from "@maplibre/maplibre-react-native";

import { useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { RootStackParamList } from "../../navigation/types";


const MAP_STYLE_URL =
  "https://api.maptiler.com/maps/streets-v2/style.json?key=Js2mV1WY15ayeXH6ceQP";

type AdminPlaceMapPickerParams = {
  initialLat?: number;
  initialLon?: number;
};

export default function AdminPlaceMapPickerScreen() {
  // ⬅️ ניווט עם טיפוס נכון — אין צורך ב־as never
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute();
  const params = route.params as AdminPlaceMapPickerParams | undefined;

  const [selectedLat, setSelectedLat] = useState<number | null>(
    params?.initialLat ?? 31.25
  );
  const [selectedLon, setSelectedLon] = useState<number | null>(
    params?.initialLon ?? 34.8
  );

  function handleMapPress(e: any) {
    const coords = e?.geometry?.coordinates; // [lon, lat]
    if (Array.isArray(coords) && coords.length === 2) {
      setSelectedLon(coords[0]);
      setSelectedLat(coords[1]);
    }
  }

  function handleConfirm() {
    if (selectedLat == null || selectedLon == null) return;

    navigation.navigate("AdminPlaceForm", {
      pickedLat: selectedLat,
      pickedLon: selectedLon,
    });
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
              {/* חובה צ'יילד — אפילו ריק */}
              <View />
            </PointAnnotation>
          )}
        </MapView>
      </View>

      <View style={styles.bottomPanel}>
        <Text style={styles.infoText}>
          {selectedLat != null && selectedLon != null
            ? `lat: ${selectedLat.toFixed(5)}, lon: ${selectedLon.toFixed(5)}`
            : "הקישי על המפה כדי לבחור מיקום"}
        </Text>

        <Button title="אישור מיקום" onPress={handleConfirm} />
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
  },
});
