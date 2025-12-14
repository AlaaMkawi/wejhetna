// src/screens/RegularAccount/RegularHomeScreen.tsx

import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { MapView, Camera, PointAnnotation, ShapeSource, LineLayer } from "@maplibre/maplibre-react-native";
import Geolocation from "@react-native-community/geolocation";
import { fetchPlacesByBbox, PlaceForMap } from "../../api/places";

const MAP_STYLE_URL =
  "https://api.maptiler.com/maps/019b0319-f856-79df-b13b-917c4a28f9a8/style.json?key=Js2mV1WY15ayeXH6ceQP";

const INITIAL_CENTER: [number, number] = [34.83, 31.24];
const INITIAL_ZOOM = 13;

type Props = {
  navigation: any;
};

type RouteCoordinates = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: {
      type: "LineString";
      coordinates: [number, number][];
    };
    properties: Record<string, any>;
  }>;
};

export default function RegularHomeScreen({ navigation }: Props) {
  const cameraRef = useRef<any>(null);
  const mapRef = useRef<any>(null);

  // GPS Location
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);

  // Places
  const [places, setPlaces] = useState<PlaceForMap[]>([]);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PlaceForMap[]>([]);
  const [showSearchModal, setShowSearchModal] = useState(false);

  // Destination
  const [destination, setDestination] = useState<{ lat: number; lon: number; name?: string } | null>(null);
  const [customPin, setCustomPin] = useState<{ lat: number; lon: number } | null>(null);

  // Route
  const [routeCoordinates, setRouteCoordinates] = useState<RouteCoordinates | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeInfo, setRouteInfo] = useState<{
    distance: number; // in meters
    duration: number; // in seconds
    startAddress?: string;
    endAddress?: string;
  } | null>(null);

  // Navigation (tracking movement)
  const [isNavigating, setIsNavigating] = useState(false);
  const [watchId, setWatchId] = useState<number | null>(null);

  // Map bounds
  const [mapBounds, setMapBounds] = useState({
    north: 31.5,
    south: 31.0,
    east: 35.0,
    west: 34.5,
  });

  // Get user's GPS location
  useEffect(() => {
    setLocationLoading(true);
    Geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation({ lat: latitude, lon: longitude });
        setLocationLoading(false);

        // Center map on user location
        if (cameraRef.current) {
          cameraRef.current.setCamera({
            centerCoordinate: [longitude, latitude],
            zoomLevel: INITIAL_ZOOM,
            animationDuration: 1000,
          });
        }
      },
      (error) => {
        console.log("GPS error", error);
        Alert.alert("Location Error", "Could not get your location. Using default location.");
        setLocationLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 10000,
      }
    );
  }, []);

  // Fetch places when map bounds change
  useEffect(() => {
    const fetchPlacesForVisibleArea = async () => {
      try {
        const data = await fetchPlacesByBbox(
          mapBounds.north,
          mapBounds.south,
          mapBounds.east,
          mapBounds.west
        );
        setPlaces(data || []);
      } catch (error: any) {
        console.error("Failed to fetch places:", error?.message || String(error) || "Unknown error");
        // Set empty array on error to prevent crashes
        setPlaces([]);
      }
    };

    fetchPlacesForVisibleArea();
  }, [mapBounds]);

  // Handle map region change
  const onRegionDidChange = (feature: any) => {
    try {
      // Try to get bounds from different possible structures
      let bounds = null;
      
      if (feature?.properties?.visibleBounds) {
        bounds = feature.properties.visibleBounds;
      } else if (feature?.properties?.bounds) {
        bounds = feature.properties.bounds;
      } else if (feature?.geometry?.coordinates) {
        // If we have center coordinates, calculate approximate bounds
        const [lon, lat] = feature.geometry.coordinates;
        const zoom = feature.properties?.zoomLevel || INITIAL_ZOOM;
        // Approximate bounds based on zoom level
        const latDelta = 0.1 / Math.pow(2, zoom - 10);
        const lonDelta = 0.1 / Math.pow(2, zoom - 10);
        bounds = {
          north: lat + latDelta,
          south: lat - latDelta,
          east: lon + lonDelta,
          west: lon - lonDelta,
        };
      }

      if (bounds && bounds.north && bounds.south && bounds.east && bounds.west) {
        setMapBounds({
          north: bounds.north,
          south: bounds.south,
          east: bounds.east,
          west: bounds.west,
        });
      }
    } catch (error) {
      console.log("Error parsing map bounds:", error);
    }
  };

  // Handle map long press (drop custom pin)
  const handleMapLongPress = (e: any) => {
    try {
      const coords = e?.geometry?.coordinates;
      if (Array.isArray(coords) && coords.length >= 2) {
        const [lon, lat] = coords;
        setCustomPin({ lat, lon });
        setDestination({ lat, lon, name: `📍 ${lat.toFixed(5)}, ${lon.toFixed(5)}` });
        setRouteCoordinates(null); // Clear any existing route
        setRouteInfo(null); // Clear route info
        setSearchResults([]);
        setShowSearchModal(false);
      }
    } catch (error) {
      console.error("Error handling long press:", error);
    }
  };

  // Handle place marker tap
  const handlePlaceTap = (place: PlaceForMap) => {
    setDestination({
      lat: place.location.lat,
      lon: place.location.lon,
      name: place.name,
    });
    setCustomPin(null);
    setRouteCoordinates(null); // Clear any existing route
    setRouteInfo(null); // Clear route info
    setShowSearchModal(false);
  };

  // Search places by name
  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (query.trim().length === 0) {
      setSearchResults([]);
      return;
    }

    try {
      const filtered = places.filter(
        (place) =>
          (place.name && place.name.toLowerCase().includes(query.toLowerCase())) ||
          (place.name_ar && place.name_ar.toLowerCase().includes(query.toLowerCase())) ||
          (place.name_he && place.name_he.toLowerCase().includes(query.toLowerCase()))
      );
      setSearchResults(filtered);
    } catch (error) {
      console.error("Search error:", error);
      setSearchResults([]);
    }
  };

  // Get route from user location to destination using MapTiler
  const getRoute = async () => {
    if (!userLocation || !destination) {
      Alert.alert("Error", "Please select a destination first");
      return;
    }

    setRouteLoading(true);
    setRouteInfo(null);
    
    try {
      // Using MapTiler Directions API for driving directions
      // To get a free MapTiler API key:
      // 1. Go to https://cloud.maptiler.com/account/keys/ and sign up/login
      // 2. Copy your API key
      // 3. Replace "YOUR_MAPTILER_API_KEY" below with your key
      // 
      // Note: Free tier includes generous limits
      // Using OSRM (Open Source Routing Machine) - free, no API key needed
      // OSRM provides driving directions with detailed route information
      // Format: /route/v1/{profile}/{coordinates}?overview=full&geometries=geojson
      const profile = "driving"; // driving, walking, or cycling
      const coordinates = `${userLocation.lon},${userLocation.lat};${destination.lon},${destination.lat}`;
      
      // Using OSRM public server (free, no API key required)
      const url = `https://router.project-osrm.org/route/v1/${profile}/${coordinates}?overview=full&geometries=geojson&alternatives=false&steps=false`;
      
      console.log("Requesting route from OSRM:", url);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("OSRM API error:", response.status, errorText);
        throw new Error(`Routing service error: ${response.status} - ${errorText}`);
      }
      
      const routeData = await response.json();
      
      // OSRM response format: { code: "Ok", routes: [{ distance, duration, geometry }] }
      if (routeData.code === "Ok" && routeData.routes && routeData.routes.length > 0) {
        const route = routeData.routes[0];
        
        // Extract route information
        const distance = route.distance || 0; // in meters
        const duration = route.duration || 0; // in seconds
        
        // OSRM geometry format is already GeoJSON LineString
        const routeGeometry = route.geometry || {
          type: "LineString",
          coordinates: [
            [userLocation.lon, userLocation.lat],
            [destination.lon, destination.lat],
          ],
        };
        
        // Set route geometry for display
        setRouteCoordinates({
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: routeGeometry,
              properties: {},
            },
          ],
        });

        // Store route info (distance, duration)
        setRouteInfo({
          distance,
          duration,
          startAddress: "Your Location",
          endAddress: destination.name || "Destination",
        });

        // Center map on route
        if (cameraRef.current) {
          const midLat = (userLocation.lat + destination.lat) / 2;
          const midLon = (userLocation.lon + destination.lon) / 2;
          cameraRef.current.setCamera({
            centerCoordinate: [midLon, midLat],
            zoomLevel: 14,
            animationDuration: 1000,
          });
        }
      } else {
        const errorMsg = routeData.code === "NoRoute" 
          ? "No route found between these points"
          : routeData.message || "No route found in response";
        throw new Error(errorMsg);
      }
    } catch (error: any) {
      console.error("Route error:", error?.message || String(error));
      Alert.alert(
        "Route Error",
        error?.message || "Could not get driving directions. Please check your MapTiler API key and try again."
      );
      setRouteCoordinates(null);
      setRouteInfo(null);
    } finally {
      setRouteLoading(false);
    }
  };

  // Start navigation (track movement)
  const startNavigation = () => {
    if (!userLocation || !destination) {
      Alert.alert("Error", "Please select a destination and get directions first");
      return;
    }

    setIsNavigating(true);

    // Watch position updates
    const id = Geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const newLocation = { lat: latitude, lon: longitude };
        setUserLocation(newLocation); // Update user location marker

        // Update map camera to follow user
        if (cameraRef.current) {
          cameraRef.current.setCamera({
            centerCoordinate: [longitude, latitude],
            zoomLevel: 16, // Closer zoom when navigating
            animationDuration: 500,
          });
        }
      },
      (error) => {
        console.error("GPS tracking error:", error);
        Alert.alert("Location Error", "Could not track your location. Navigation stopped.");
        stopNavigation();
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 1000,
        distanceFilter: 5, // Update every 5 meters
      }
    );

    setWatchId(id);
  };

  // Stop navigation
  const stopNavigation = () => {
    if (watchId !== null) {
      Geolocation.clearWatch(watchId);
      setWatchId(null);
    }
    setIsNavigating(false);
  };

  // Clear route
  const clearRoute = () => {
    stopNavigation();
    setRouteCoordinates(null);
    setRouteInfo(null);
    setDestination(null);
    setCustomPin(null);
  };

  // Format distance
  const formatDistance = (meters: number): string => {
    if (meters < 1000) {
      return `${Math.round(meters)} m`;
    }
    return `${(meters / 1000).toFixed(1)} km`;
  };

  // Format duration
  const formatDuration = (seconds: number): string => {
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) {
      return `${minutes} min`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
  };

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search places..."
          placeholderTextColor="#666"
          value={searchQuery}
          onChangeText={handleSearch}
          onFocus={() => setShowSearchModal(true)}
        />
        {locationLoading && (
          <ActivityIndicator size="small" color="#1e90ff" style={styles.loader} />
        )}
      </View>

      {/* Search Results Modal */}
      <Modal
        visible={showSearchModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSearchModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Search Places</Text>
              <TouchableOpacity onPress={() => setShowSearchModal(false)}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.searchResultsList}>
              {searchResults.length === 0 && searchQuery.trim().length > 0 && (
                <Text style={styles.noResults}>No places found</Text>
              )}
              {searchResults.map((place) => (
                <TouchableOpacity
                  key={place.id}
                  style={styles.searchResultItem}
                  onPress={() => {
                    handlePlaceTap(place);
                    setSearchQuery("");
                    setShowSearchModal(false);
                  }}
                >
                  <Text style={styles.searchResultName}>{place.name || "Unnamed Place"}</Text>
                  {place.name_ar && (
                    <Text style={styles.searchResultNameAr}>{place.name_ar}</Text>
                  )}
                  {place.city && place.city.name_ar && (
                    <Text style={styles.searchResultCity}>{place.city.name_ar}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        mapStyle={MAP_STYLE_URL}
        onRegionDidChange={onRegionDidChange}
        onLongPress={handleMapLongPress}
        onPress={(e: any) => {
          // Handle regular tap - check if tapping near a place
          try {
            const coords = e?.geometry?.coordinates;
            if (Array.isArray(coords) && coords.length >= 2) {
              const [lon, lat] = coords;
              // Find nearest place within reasonable distance
              const nearestPlace = places.find((place) => {
                if (!place.location) return false;
                const distance = Math.sqrt(
                  Math.pow(place.location.lon - lon, 2) + Math.pow(place.location.lat - lat, 2)
                );
                return distance < 0.001; // ~100 meters
              });
              if (nearestPlace) {
                handlePlaceTap(nearestPlace);
              }
            }
          } catch {
            // Ignore tap errors
          }
        }}
        scrollEnabled={true}
        rotateEnabled={false}
        pitchEnabled={false}
        logoEnabled={false}
        attributionEnabled={false}
      >
        <Camera ref={cameraRef} defaultSettings={{ centerCoordinate: INITIAL_CENTER, zoomLevel: INITIAL_ZOOM }} />

        {/* User Location Marker */}
        {userLocation && (
          <PointAnnotation id="user_location" coordinate={[userLocation.lon, userLocation.lat]}>
            <View style={styles.userLocationMarker}>
              <View style={styles.userLocationDot} />
            </View>
          </PointAnnotation>
        )}

        {/* Place Markers */}
        {places.map((place) => (
          <PointAnnotation
            key={place.id}
            id={`place_${place.id}`}
            coordinate={[place.location.lon, place.location.lat]}
            onSelected={() => handlePlaceTap(place)}
          >
            <View style={styles.placeMarker}>
              <Text style={styles.placeMarkerText}>
                {place.place_type === "BUSINESS" ? "🏪" : "🏛️"}
              </Text>
            </View>
          </PointAnnotation>
        ))}

        {/* Custom Pin Marker */}
        {customPin && (
          <PointAnnotation id="custom_pin" coordinate={[customPin.lon, customPin.lat]}>
            <View style={styles.customPinMarker}>
              <View style={styles.customPinDot} />
            </View>
          </PointAnnotation>
        )}

        {/* Destination Marker */}
        {destination && !customPin && (
          <PointAnnotation id="destination" coordinate={[destination.lon, destination.lat]}>
            <View style={styles.destinationMarker}>
              <Text style={styles.destinationMarkerText}>📍</Text>
            </View>
          </PointAnnotation>
        )}

        {/* Route Line */}
        {routeCoordinates && (
          <ShapeSource id="route" shape={routeCoordinates}>
            <LineLayer
              id="routeLine"
              style={{
                lineColor: "#1e90ff",
                lineWidth: 4,
                lineCap: "round",
                lineJoin: "round",
              }}
            />
          </ShapeSource>
        )}
      </MapView>

      {/* Route Info Card - Floating above map */}
      {routeInfo && (
        <View style={styles.routeInfoCard}>
          <View style={styles.routeInfoHeader}>
            <Text style={styles.routeInfoTitle}>Route Details</Text>
            <TouchableOpacity onPress={clearRoute} style={styles.closeRouteButton}>
              <Text style={styles.closeRouteText}>✕</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.routeInfoContent}>
            <View style={styles.routeInfoMain}>
              <View style={styles.routeInfoMainItem}>
                <Text style={styles.routeInfoMainLabel}>⏱️ Time</Text>
                <Text style={styles.routeInfoMainValue}>{formatDuration(routeInfo.duration)}</Text>
              </View>
              <View style={styles.routeInfoDivider} />
              <View style={styles.routeInfoMainItem}>
                <Text style={styles.routeInfoMainLabel}>📏 Distance</Text>
                <Text style={styles.routeInfoMainValue}>{formatDistance(routeInfo.distance)}</Text>
              </View>
            </View>
            <View style={styles.routeInfoAddresses}>
              <View style={styles.routeAddressItem}>
                <Text style={styles.routeAddressLabel}>📍 From:</Text>
                <Text style={styles.routeAddressValue}>{routeInfo.startAddress}</Text>
              </View>
              <View style={styles.routeAddressItem}>
                <Text style={styles.routeAddressLabel}>🎯 To:</Text>
                <Text style={styles.routeAddressValue} numberOfLines={2}>{routeInfo.endAddress}</Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Bottom Panel */}
      <View style={styles.bottomPanel}>
        {destination && !routeInfo && (
          <View style={styles.destinationInfo}>
            <Text style={styles.destinationLabel}>Destination:</Text>
            <Text style={styles.destinationName} numberOfLines={1}>
              {destination.name || "Custom Location"}
            </Text>
          </View>
        )}

        <View style={styles.actionsRow}>
          {destination && !routeCoordinates && (
            <TouchableOpacity
              style={[styles.actionButton, styles.goButton]}
              onPress={getRoute}
              disabled={routeLoading}
            >
              {routeLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.actionButtonText}>Get Directions</Text>
              )}
            </TouchableOpacity>
          )}

          {routeCoordinates && !isNavigating && (
            <>
              <TouchableOpacity
                style={[styles.actionButton, styles.navigateButton]}
                onPress={startNavigation}
              >
                <Text style={styles.actionButtonText}>🚗 Start Navigation</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.clearButton]}
                onPress={clearRoute}
              >
                <Text style={styles.actionButtonText}>Clear Route</Text>
              </TouchableOpacity>
            </>
          )}

          {isNavigating && (
            <TouchableOpacity
              style={[styles.actionButton, styles.stopButton]}
              onPress={stopNavigation}
            >
              <Text style={styles.actionButtonText}>⏹️ Stop Navigation</Text>
            </TouchableOpacity>
          )}

          {!isNavigating && (
            <TouchableOpacity
              style={[styles.actionButton, styles.logoutButton]}
              onPress={() =>
                navigation.reset({
                  index: 0,
                  routes: [{ name: "Home" }],
                })
              }
            >
              <Text style={styles.actionButtonText}>Log Out</Text>
            </TouchableOpacity>
          )}
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
  searchContainer: {
    position: "absolute",
    top: 50,
    left: 16,
    right: 16,
    zIndex: 1000,
    flexDirection: "row",
    alignItems: "center",
  },
  searchInput: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 12,
    fontSize: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  loader: {
    marginLeft: 8,
  },
  map: {
    flex: 1,
  },
  userLocationMarker: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#1e90ff",
    borderWidth: 3,
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  userLocationDot: {
    flex: 1,
    borderRadius: 7,
    backgroundColor: "#1e90ff",
  },
  placeMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: "#1e90ff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  placeMarkerText: {
    fontSize: 18,
  },
  customPinMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#ff6b6b",
    borderWidth: 3,
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  customPinDot: {
    flex: 1,
    borderRadius: 9,
    backgroundColor: "#ff6b6b",
  },
  destinationMarker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#fff",
    borderWidth: 3,
    borderColor: "#28a745",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  destinationMarkerText: {
    fontSize: 24,
  },
  bottomPanel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    padding: 16,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  destinationInfo: {
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  destinationLabel: {
    fontSize: 12,
    color: "#666",
    marginBottom: 4,
  },
  destinationName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  routeInfoCard: {
    position: "absolute",
    top: 100,
    left: 16,
    right: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 1000,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  routeInfoHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  routeInfoTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    letterSpacing: -0.5,
  },
  closeRouteButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  closeRouteText: {
    fontSize: 16,
    color: "#6B7280",
    fontWeight: "600",
  },
  routeInfoContent: {
    gap: 12,
  },
  routeInfoMain: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    padding: 16,
  },
  routeInfoMainItem: {
    alignItems: "center",
    flex: 1,
  },
  routeInfoMainLabel: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "600",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  routeInfoMainValue: {
    fontSize: 24,
    fontWeight: "800",
    color: "#111827",
    letterSpacing: -0.5,
  },
  routeInfoDivider: {
    width: 1,
    height: 40,
    backgroundColor: "#E5E7EB",
  },
  routeInfoAddresses: {
    gap: 8,
  },
  routeAddressItem: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  routeAddressLabel: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "600",
    marginRight: 8,
    minWidth: 50,
  },
  routeAddressValue: {
    fontSize: 14,
    color: "#111827",
    fontWeight: "500",
    flex: 1,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 12,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  goButton: {
    backgroundColor: "#28a745",
  },
  navigateButton: {
    backgroundColor: "#1e90ff",
  },
  stopButton: {
    backgroundColor: "#ff6b6b",
    flex: 2,
  },
  clearButton: {
    backgroundColor: "#ff6b6b",
  },
  logoutButton: {
    backgroundColor: "#6c757d",
  },
  actionButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "70%",
    padding: 16,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#333",
  },
  closeButton: {
    fontSize: 24,
    color: "#666",
    fontWeight: "300",
  },
  searchResultsList: {
    maxHeight: 400,
  },
  searchResultItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  searchResultName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  searchResultNameAr: {
    fontSize: 14,
    color: "#666",
    marginBottom: 2,
  },
  searchResultCity: {
    fontSize: 12,
    color: "#999",
  },
  noResults: {
    padding: 16,
    textAlign: "center",
    color: "#999",
    fontSize: 14,
  },
});
