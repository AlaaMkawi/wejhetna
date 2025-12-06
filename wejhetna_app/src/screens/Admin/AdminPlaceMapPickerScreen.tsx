// src/screens/Admin/AdminPlaceMapPickerScreen.tsx

import React, { useState, useEffect } from "react";
import { View, Button, StyleSheet, Text, Alert } from "react-native";
import {
  MapView,
  Camera,
  PointAnnotation,
} from "@maplibre/maplibre-react-native";

import { useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { RootStackParamList } from "../../navigation/types";

// ייבוא פונקציית שליפת המקומות
import {
  fetchAllPlaces,
  PlaceForMap,
  checkOsmForGps,      // 👈 הוספנו
} from "../../api/places";

// 👇 צריך להתקין ולהגדיר ספרייה למיקום (לדוגמה):
// npm install @react-native-community/geolocation
// ואז:
import Geolocation from "@react-native-community/geolocation";

const MAP_STYLE_URL =
  "https://api.maptiler.com/maps/streets-v2/style.json?key=Js2mV1WY15ayeXH6ceQP";

type AdminPlaceMapPickerParams = {
  initialLat?: number;
  initialLon?: number;
};

type NavType = NativeStackNavigationProp<RootStackParamList>;

type SourceType = "MAP_PICK" | "GPS_NO_OSM" | "GPS_WITH_OSM";

export default function AdminPlaceMapPickerScreen() {
  const navigation = useNavigation<NavType>();
  const route = useRoute();
  const params = route.params as AdminPlaceMapPickerParams | undefined;

  const [selectedLat, setSelectedLat] = useState<number | null>(
    params?.initialLat ?? 31.25
  );
  const [selectedLon, setSelectedLon] = useState<number | null>(
    params?.initialLon ?? 34.8
  );

  // סוג המקור: ברירת מחדל MAP_PICK
  const [selectedSource, setSelectedSource] =
    useState<SourceType>("MAP_PICK");

  // osm_id אם יש התאמה
  const [selectedOsmId, setSelectedOsmId] = useState<string | null>(null);

  const [gpsLoading, setGpsLoading] = useState(false);

  // משתנה למקומות הקיימים
  const [existingPlaces, setExistingPlaces] = useState<PlaceForMap[]>([]);

  // טעינת המקומות בעליית המסך
  useEffect(() => {
    async function load() {
      try {
        const data = await fetchAllPlaces();
        setExistingPlaces(data);
      } catch (e) {
        console.log("Error loading existing places", e);
      }
    }
    load();
  }, []);

  // בחירה ידנית על המפה
  function handleMapPress(e: any) {
    const coords = e?.geometry?.coordinates; // [lon, lat]
    if (Array.isArray(coords) && coords.length === 2) {
      setSelectedLon(coords[0]);
      setSelectedLat(coords[1]);
      setSelectedSource("MAP_PICK"); // 👈 זה מפה
      setSelectedOsmId(null);        // לא מקושר ל־OSM
    }
  }

  // כפתור: "המיקום שלי" → GPS
  function handleUseMyLocation() {
    setGpsLoading(true);

    Geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;

        // שמים נקודה על המפה
        setSelectedLat(latitude);
        setSelectedLon(longitude);
        setSelectedSource("GPS_NO_OSM"); // בהתחלה נניח שזה עסק חדש
        setSelectedOsmId(null);

        try {
          const result = await checkOsmForGps(latitude, longitude);

          if (result.match_found && result.osm_id) {
            Alert.alert(
              "נמצא מקום קיים",
              "מצאנו מקום שנראה תואם למיקום שלך ב־OSM. האם זה העסק שלך?",
              [
                {
                  text: "כן",
                  onPress: () => {
                    setSelectedSource("GPS_WITH_OSM");
                    setSelectedOsmId(result.osm_id || null);
                  },
                },
                {
                  text: "לא",
                  style: "cancel",
                  onPress: () => {
                    setSelectedSource("GPS_NO_OSM");
                    setSelectedOsmId(null);
                  },
                },
              ]
            );
          } else {
            Alert.alert(
              "לא נמצא מקום קיים",
              "לא מצאנו מקום רשום ב־OSM במיקום הזה. ניצור את המקום כעסק חדש."
            );
          }
        } catch (err) {
          console.log("GPS / OSM CHECK ERROR", err);
          Alert.alert(
            "שגיאה בבדיקת OSM",
            "נוכל עדיין להשתמש במיקום ה־GPS שלך כעסק חדש."
          );
        } finally {
          setGpsLoading(false);
        }
      },
      (error) => {
        console.log("GPS error", error);
        Alert.alert("שגיאה במיקום", "לא הצלחנו לקרוא את המיקום מהמכשיר.");
        setGpsLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 10000,
      }
    );
  }

  // כפתור: "אישור מיקום" → מעבר לטופס
  function handleConfirm() {
    if (selectedLat == null || selectedLon == null) return;

    navigation.navigate("AdminPlaceForm", {
      pickedLat: selectedLat,
      pickedLon: selectedLon,
      pickedSource: selectedSource,    // 👈 חשוב ל־MAP_PICK / GPS_xxx
      pickedOsmId: selectedOsmId,      // 👈 יכול להיות null
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

          {/* --- הצגת המקומות הקיימים עם שמות --- */}
          {existingPlaces.map((place) => {
            if (!place.location) return null;
            return (
              <PointAnnotation
                key={place.id}
                id={`existing_${place.id}`}
                coordinate={[place.location.lon, place.location.lat]}
              >
                <View style={styles.placeLabelContainer}>
                  <Text style={styles.placeLabelText}>{place.name}</Text>
                </View>
              </PointAnnotation>
            );
          })}

          {/* --- הנקודה שנבחרה (מפה או GPS) --- */}
          {selectedLat != null && selectedLon != null && (
            <PointAnnotation
              id="selected_point"
              coordinate={[selectedLon, selectedLat]}
            >
              {/* אפשר לעצב פה נקודה אם תרצי */}
              <View style={styles.selectedDot} />
            </PointAnnotation>
          )}
        </MapView>
      </View>

      <View style={styles.bottomPanel}>
        <Text style={styles.infoText}>
          {selectedLat != null && selectedLon != null
            ? `lat: ${selectedLat.toFixed(5)}, lon: ${selectedLon.toFixed(5)} (${selectedSource})`
            : "הקישי על המפה או השתמשי במיקום שלי"}
        </Text>

        <View style={styles.buttonsRow}>
          <View style={styles.buttonWrapper}>
            <Button
              title={gpsLoading ? "טוען מיקום..." : "📍 המיקום שלי"}
              onPress={handleUseMyLocation}
              disabled={gpsLoading}
            />
          </View>

          <View style={styles.buttonWrapper}>
            <Button title="אישור מיקום" onPress={handleConfirm} />
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
  },

  buttonsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  buttonWrapper: {
    flex: 1,
    marginHorizontal: 4,
  },

  // --- עיצוב לשם של המקום ---
  placeLabelContainer: {
    backgroundColor: "rgba(255, 255, 255, 0.8)",
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#ccc",
  },
  placeLabelText: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#333",
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
