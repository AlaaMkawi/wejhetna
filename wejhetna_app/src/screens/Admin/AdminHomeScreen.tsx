// src/screens/AdminHomeScreen.tsx

import React, { useEffect, useState, useRef } from "react";
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Platform,
  StatusBar,
} from "react-native";
import { MapView, Camera, PointAnnotation } from "@maplibre/maplibre-react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList, AdminTabParamList } from "../../navigation/types";
import { fetchAllPlaces, PlaceForMap } from "../../api/places";

const MAP_STYLE_URL =
  "https://api.maptiler.com/maps/019b0319-f856-79df-b13b-917c4a28f9a8/style.json?key=Js2mV1WY15ayeXH6ceQP";

const INITIAL_CENTER: [number, number] = [34.83, 31.24];
const INITIAL_ZOOM = 12.5;
const LABEL_VISIBLE_ZOOM_THRESHOLD = 14;

const NEGEV_BOUNDS = {
  ne: [35.10, 31.42],
  sw: [34.72, 31.18],
};

type NavType = NativeStackNavigationProp<RootStackParamList>;
type AdminHomeRoute = RouteProp<AdminTabParamList, "AdminHome">;

export default function AdminHomeScreen() {
  const navigation = useNavigation<NavType>();
  const route = useRoute<AdminHomeRoute>();
  const { adminUserId, role } = route.params; // 👈 יש לנו את שניהם
  const cameraRef = useRef<any>(null);

  const [places, setPlaces] = useState<PlaceForMap[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<PlaceForMap | null>(null);
  const [, setLoadingPlaces] = useState(false);
  const [, setError] = useState<string | null>(null);

  const [currentZoom, setCurrentZoom] = useState(INITIAL_ZOOM);

  useEffect(() => {
    async function load() {
      try {
        setLoadingPlaces(true);
        setError(null);
        const data = await fetchAllPlaces();
        setPlaces(data);
      } catch (e) {
        console.error(e);
        setError("Failed to load places");
      } finally {
        setLoadingPlaces(false);
      }
    }
    load();
  }, []);

  const onRegionDidChange = async (feature: any) => {
    const [lon, lat] = feature.geometry.coordinates;
    const newZoom = feature.properties.zoomLevel;
    setCurrentZoom(newZoom);

    if (lon < 34.72 || lat > 31.43) {
      cameraRef.current?.setCamera({
        centerCoordinate: [34.75, 31.39],
        animationDuration: 600,
      });
    }
  };

  const resetCamera = () => {
    cameraRef.current?.setCamera({
      centerCoordinate: INITIAL_CENTER,
      zoomLevel: INITIAL_ZOOM,
      animationDuration: 1000,
    });
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <MapView
        style={styles.map}
        mapStyle={MAP_STYLE_URL}
        onRegionDidChange={onRegionDidChange}
        scrollEnabled={true}
        rotateEnabled={false}
        pitchEnabled={false}
        logoEnabled={false}
        attributionEnabled={false}
      >
        <Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: INITIAL_CENTER,
            zoomLevel: INITIAL_ZOOM,
          }}
          maxBounds={NEGEV_BOUNDS}
          minZoomLevel={10}
          maxZoomLevel={18}
          animationMode="flyTo"
        />

        {places.map((place) => {
          if (!place.location) return null;
          const isSelected = selectedPlace?.id === place.id;
          const shouldShowLabel =
            currentZoom >= LABEL_VISIBLE_ZOOM_THRESHOLD || isSelected;

          return (
            <PointAnnotation
              key={place.id}
              id={String(place.id)}
              coordinate={[place.location.lon, place.location.lat]}
              onSelected={() => setSelectedPlace(place)}
            >
              <View style={styles.nativeMarkerContainer}>
                <View
                  style={[
                    styles.dotContainer,
                    isSelected && styles.dotSelected,
                  ]}
                >
                  <View style={styles.innerDot} />
                </View>

                {shouldShowLabel && (
                  <View style={styles.labelWrapper}>
                    <Text style={styles.nativeMapLabel} numberOfLines={1}>
                      {place.name}
                    </Text>
                  </View>
                )}
              </View>
            </PointAnnotation>
          );
        })}
      </MapView>

      <View style={styles.topGlassBar}>
        <View>
          <Text style={styles.headerTitle}>Negev Community</Text>
          <Text style={styles.headerSubtitle}>
            {places.length} מקומות ביישובי הנגב
          </Text>
        </View>
        <View style={styles.topButtonsRow}>
          <TouchableOpacity
            style={styles.glassButtonSmall}
            onPress={() =>     
                navigation.navigate("AdminCities", {
                adminUserId: adminUserId,
                role: role,
              })
            }
          >
          <Text style={styles.glassButtonText}>ערים</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.glassButtonSmall, { marginLeft: 8 }]}
            onPress={() =>
              navigation.navigate("AdminCategories", {
                adminUserId,
                role,
              })
            }
          >
            <Text style={styles.glassButtonText}>קטגוריות</Text>
          </TouchableOpacity>
        </View>
      </View>

      {!selectedPlace && (
        <TouchableOpacity
          style={styles.fabButton}
          onPress={() =>
            navigation.navigate("AdminPlaceMapPicker", {
              initialLat: INITIAL_CENTER[1],
              initialLon: INITIAL_CENTER[0],
              adminUserId,
              role,
            })
          }
        >
          <Text style={styles.fabIcon}>+</Text>
          <Text style={styles.fabText}>הוסף מקום</Text>
        </TouchableOpacity>
      )}

      {!selectedPlace && (
        <TouchableOpacity style={styles.recenterButton} onPress={resetCamera}>
          <Text style={{ fontSize: 20 }}>🎯</Text>
        </TouchableOpacity>
      )}

      {selectedPlace && (
        <View style={styles.bottomSheetCard}>
          <View style={styles.sheetHandle} />
          <View style={styles.cardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {selectedPlace.name}
              </Text>
              <Text style={styles.cardSubtitle}>
                {selectedPlace.place_type === "BUSINESS" ? "עסק" : "ציבורי"}
                {selectedPlace.city?.name_he
                  ? ` • ${selectedPlace.city.name_he}`
                  : ""}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setSelectedPlace(null)}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.divider} />
          <View style={styles.cardContent}>
            {selectedPlace.description && (
              <Text style={styles.descriptionText} numberOfLines={3}>
                {selectedPlace.description}
              </Text>
            )}
          </View>
          <TouchableOpacity style={styles.editActionButton}>
            <Text style={styles.editActionText}>ערוך פרטי מקום</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// --- סגנונות חדשים למראה של Google Maps ---

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F2F2F7" },
  map: { flex: 1 },

  // מרקר בסגנון גוגל מפות
  nativeMarkerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible', // חשוב כדי שהטקסט לא ייחתך
  },
  
  // הנקודה על המפה
  dotContainer: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
    zIndex: 2, // שהנקודה תהיה מעל הטקסט קצת
  },
  innerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4285F4', // הצבע הכחול הקלאסי של גוגל (או הטורקיז שלך)
  },
  dotSelected: {
    transform: [{ scale: 1.3 }],
    borderWidth: 2,
    borderColor: '#4285F4',
  },

  // מעטפת לטקסט
  labelWrapper: {
    marginTop: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.85)', // רקע חצי שקוף כמו בגוגל
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.1)',
    zIndex: 1,
  },
  nativeMapLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#333333',
    textAlign: 'center',
  },

  // --- שאר הסגנונות ללא שינוי ---
  topGlassBar: {
    position: "absolute",
    top: Platform.OS === 'ios' ? 60 : 40,
    left: 16,
    right: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.9)", 
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,1)",
  },
  headerTitle: { fontSize: 17, fontWeight: "800", color: "#1D1D1F", letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 12, color: "#86868B", marginTop: 2, fontWeight: "500" },
  topButtonsRow: { flexDirection: "row" },
  glassButtonSmall: {
    backgroundColor: "#F2F2F7",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: "rgba(0,0,0,0.05)",
  },
  glassButtonText: { fontSize: 13, fontWeight: "600", color: "#007AFF" },
  fabButton: {
    position: "absolute", bottom: 30, alignSelf: "center", backgroundColor: "#1D1D1F", 
    flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 24, borderRadius: 32,
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 10,
  },
  fabIcon: { color: "#FFF", fontSize: 22, marginRight: 8, fontWeight: "300", marginTop: -2 },
  fabText: { color: "#FFF", fontSize: 15, fontWeight: "600" },
  recenterButton: {
    position: "absolute", right: 20, bottom: 100, width: 44, height: 44, borderRadius: 22, backgroundColor: "#FFF",
    alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 5,
  },
  bottomSheetCard: {
    position: "absolute", bottom: 24, left: 16, right: 16, backgroundColor: "#FFFFFF", borderRadius: 28, padding: 24,
    shadowColor: "#000", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 12, borderWidth: 1, borderColor: "rgba(0,0,0,0.03)",
  },
  sheetHandle: { width: 36, height: 5, backgroundColor: "#E5E5EA", borderRadius: 3, alignSelf: "center", marginBottom: 20 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  cardTitle: { fontSize: 22, fontWeight: "800", color: "#1D1D1F", marginBottom: 4, letterSpacing: -0.5 },
  cardSubtitle: { fontSize: 14, color: "#86868B", fontWeight: "500" },
  closeButton: { padding: 8, backgroundColor: "#F2F2F7", borderRadius: 50, marginLeft: 10 },
  closeButtonText: { fontSize: 12, color: "#8E8E93", fontWeight: "bold" },
  divider: { height: 1, backgroundColor: "#F2F2F7", marginVertical: 18 },
  cardContent: { marginBottom: 20 },
  descriptionText: { marginTop: 8, fontSize: 14, color: "#636366", lineHeight: 20 },
  editActionButton: { backgroundColor: "#007AFF", paddingVertical: 15, borderRadius: 20, alignItems: "center", shadowColor: "#007AFF", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  editActionText: { color: "#FFF", fontWeight: "600", fontSize: 16 },
});