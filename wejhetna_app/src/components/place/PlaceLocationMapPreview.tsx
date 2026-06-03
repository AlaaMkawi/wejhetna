import React, { useRef } from "react";
import { StyleSheet, View } from "react-native";
import { Camera, PointAnnotation } from "@maplibre/maplibre-react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { FocusedMapView } from "../map/FocusedMapView";
import { useIosAnnotationMount } from "../map/useIosAnnotationMount";

const MAP_STYLE_URL =
  "https://api.maptiler.com/maps/019b0319-f856-79df-b13b-917c4a28f9a8/style.json?key=Js2mV1WY15ayeXH6ceQP";

type Props = {
  lat: number;
  lon: number;
  height?: number;
};

/** Compact read-only map preview with a pin (admin create/edit forms). */
export function PlaceLocationMapPreview({ lat, lon, height = 140 }: Props) {
  const showMapPin = useIosAnnotationMount();
  const cameraRef = useRef<any>(null);

  return (
    <View style={[styles.wrap, { height }]}>
      <FocusedMapView
        style={styles.map}
        mapStyle={MAP_STYLE_URL}
        logoEnabled={false}
        attributionEnabled={false}
        zoomEnabled={false}
        scrollEnabled={false}
        pitchEnabled={false}
        rotateEnabled={false}
      >
        <Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: [lon, lat],
            zoomLevel: 15.5,
          }}
        />
        {showMapPin ? (
          <PointAnnotation id="place-location-preview" coordinate={[lon, lat]}>
            <View style={styles.marker} collapsable={false}>
              <Ionicons name="location" size={22} color="#FF0000" />
            </View>
          </PointAnnotation>
        ) : null}
      </FocusedMapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(15, 91, 99, 0.25)",
    backgroundColor: "#e8f4f6",
  },
  map: { flex: 1 },
  marker: {
    alignItems: "center",
    justifyContent: "center",
  },
});
