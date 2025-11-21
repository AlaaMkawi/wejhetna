import React from "react";
import { View, StyleSheet } from "react-native";
import { MapView, Camera } from "@maplibre/maplibre-react-native";

const MAP_STYLE_URL =
  "https://api.maptiler.com/maps/streets-v2/style.json?key=Js2mV1WY15ayeXH6ceQP";

// מרכז בערך באזור באר שבע
const INITIAL_CENTER: [number, number] = [34.8, 31.25]; // [lon, lat]
const INITIAL_ZOOM = 10;

export default function App() {
  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        mapStyle={MAP_STYLE_URL}
        zoomEnabled={true}
        scrollEnabled={true}
        rotateEnabled={true}
        pitchEnabled={true}
      >
        <Camera
          centerCoordinate={INITIAL_CENTER}
          zoomLevel={INITIAL_ZOOM}
          // לא נותן להתקרב / להתרחק יותר מדי
          minZoomLevel={8}   // לא יוצאים לכל העולם
          maxZoomLevel={17}  // לא נכנסים עד רמת אבן
        />
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
});
