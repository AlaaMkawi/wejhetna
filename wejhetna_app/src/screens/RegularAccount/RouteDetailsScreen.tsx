// src/screens/RegularAccount/RouteDetailsScreen.tsx

import React, { useEffect, useState, useRef } from "react";
import { Animated } from "react-native";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Platform,
} from "react-native";
import { useTranslation } from "react-i18next";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";
import { MapView, Camera, PointAnnotation, ShapeSource, LineLayer } from "@maplibre/maplibre-react-native";
import Geolocation from "@react-native-community/geolocation";
import Ionicons from "react-native-vector-icons/Ionicons";

const MAP_STYLE_URL =
  "https://api.maptiler.com/maps/019b0319-f856-79df-b13b-917c4a28f9a8/style.json?key=Js2mV1WY15ayeXH6ceQP";

const DARK_TEAL = "#0f5b63";

type RouteDetailsRoute = NativeStackScreenProps<RootStackParamList, "RouteDetails">;

export default function RouteDetailsScreen({ route, navigation }: RouteDetailsRoute) {
  const { t } = useTranslation();
  const { routeInfo, destination, userLocation: initialUserLocation, routeCoordinates: initialRouteCoordinates } = route.params;
  const mapRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);

  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(initialUserLocation);
  const [isNavigating, setIsNavigating] = useState(false);
  const [watchId, setWatchId] = useState<number | null>(null);
  const [showFullRoute, setShowFullRoute] = useState(false);
  const [isFollowingUser, setIsFollowingUser] = useState(false);
  const [currentHeading, setCurrentHeading] = useState<number | null>(null);
  const [mapBearing, setMapBearing] = useState<number>(0);
  
  // Animation values for pulsing effect
  const pulseAnim1 = useRef(new Animated.Value(0)).current;
  const pulseAnim2 = useRef(new Animated.Value(0)).current;
  
  // Start pulse animations when navigating
  useEffect(() => {
    if (isNavigating) {
      const pulse1 = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim1, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim1, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      );
      
      const pulse2 = Animated.loop(
        Animated.sequence([
          Animated.delay(500),
          Animated.timing(pulseAnim2, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim2, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      );
      
      pulse1.start();
      pulse2.start();
      
      return () => {
        pulse1.stop();
        pulse2.stop();
      };
    }
  }, [isNavigating, pulseAnim1, pulseAnim2]);

  // Calculate bounds to show entire route
  useEffect(() => {
    if (initialRouteCoordinates && initialRouteCoordinates.features.length > 0) {
      const coordinates = initialRouteCoordinates.features[0].geometry.coordinates;
      if (coordinates.length > 0) {
        // Calculate bounding box including start and end points
        let minLon = coordinates[0][0];
        let maxLon = coordinates[0][0];
        let minLat = coordinates[0][1];
        let maxLat = coordinates[0][1];
        
        // Include all route coordinates
        coordinates.forEach(([lon, lat]) => {
          minLon = Math.min(minLon, lon);
          maxLon = Math.max(maxLon, lon);
          minLat = Math.min(minLat, lat);
          maxLat = Math.max(maxLat, lat);
        });

        // Include user location if available
        if (userLocation) {
          minLon = Math.min(minLon, userLocation.lon);
          maxLon = Math.max(maxLon, userLocation.lon);
          minLat = Math.min(minLat, userLocation.lat);
          maxLat = Math.max(maxLat, userLocation.lat);
        }

        // Include destination if available
        if (destination) {
          minLon = Math.min(minLon, destination.lon);
          maxLon = Math.max(maxLon, destination.lon);
          minLat = Math.min(minLat, destination.lat);
          maxLat = Math.max(maxLat, destination.lat);
        }

        // Calculate center and zoom
        const centerLon = (minLon + maxLon) / 2;
        const centerLat = (minLat + maxLat) / 2;
        
        // Calculate zoom level based on bounds
        const lonDiff = maxLon - minLon;
        const latDiff = maxLat - minLat;
        const maxDiff = Math.max(lonDiff, latDiff);
        let zoomLevel = 13;
        if (maxDiff < 0.01) zoomLevel = 15;
        else if (maxDiff < 0.02) zoomLevel = 14;
        else if (maxDiff < 0.05) zoomLevel = 13;
        else zoomLevel = 12;

        // Set camera after a short delay to ensure ref is ready - smoother initial setup
        setTimeout(() => {
          if (cameraRef.current && !isNavigating) {
            cameraRef.current.setCamera({
              centerCoordinate: [centerLon, centerLat],
              zoomLevel: zoomLevel,
              animationDuration: 1500, // Slower, smoother initial animation
            });
          }
        }, 500);
      }
    }
  }, [initialRouteCoordinates, userLocation, destination, isNavigating]);

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

  // Show full route overview
  const showFullRouteOverview = () => {
    if (initialRouteCoordinates && initialRouteCoordinates.features.length > 0) {
      const coordinates = initialRouteCoordinates.features[0].geometry.coordinates;
      if (coordinates.length > 0) {
        let minLon = coordinates[0][0];
        let maxLon = coordinates[0][0];
        let minLat = coordinates[0][1];
        let maxLat = coordinates[0][1];
        
        coordinates.forEach(([lon, lat]) => {
          minLon = Math.min(minLon, lon);
          maxLon = Math.max(maxLon, lon);
          minLat = Math.min(minLat, lat);
          maxLat = Math.max(maxLat, lat);
        });

        if (userLocation) {
          minLon = Math.min(minLon, userLocation.lon);
          maxLon = Math.max(maxLon, userLocation.lon);
          minLat = Math.min(minLat, userLocation.lat);
          maxLat = Math.max(maxLat, userLocation.lat);
        }

        if (destination) {
          minLon = Math.min(minLon, destination.lon);
          maxLon = Math.max(maxLon, destination.lon);
          minLat = Math.min(minLat, destination.lat);
          maxLat = Math.max(maxLat, destination.lat);
        }

        const centerLon = (minLon + maxLon) / 2;
        const centerLat = (minLat + maxLat) / 2;
        
        const lonDiff = maxLon - minLon;
        const latDiff = maxLat - minLat;
        const maxDiff = Math.max(lonDiff, latDiff);
        let zoomLevel = 13;
        if (maxDiff < 0.01) zoomLevel = 15;
        else if (maxDiff < 0.02) zoomLevel = 14;
        else if (maxDiff < 0.05) zoomLevel = 13;
        else zoomLevel = 12;

        if (cameraRef.current) {
          cameraRef.current.setCamera({
            centerCoordinate: [centerLon, centerLat],
            zoomLevel: zoomLevel,
            animationDuration: 1200, // Smoother transition
          });
        }
        setShowFullRoute(true);
        setIsFollowingUser(false);
      }
    }
  };

  // Start navigation (track movement)
  const startNavigation = () => {
    if (!userLocation || !destination) {
      return;
    }

    setIsNavigating(true);
    setIsFollowingUser(true);
    setShowFullRoute(false);
    
    // Immediately center on user when starting navigation - smoother transition
    if (userLocation && cameraRef.current) {
      setTimeout(() => {
        if (cameraRef.current) {
          cameraRef.current.setCamera({
            centerCoordinate: [userLocation.lon, userLocation.lat],
            zoomLevel: 17.5,
            animationDuration: 1000, // Slower, smoother transition
          });
        }
      }, 200);
    }

    // Watch position updates with high accuracy
    const id = Geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, heading, accuracy } = position.coords;
        const newLocation = { lat: latitude, lon: longitude };
        setUserLocation(newLocation);

        // Update heading for compass
        if (heading !== null && heading !== undefined && !isNaN(heading)) {
          setCurrentHeading(heading);
        }

        // Update map camera to follow user when navigating - with smoother, less frequent updates
        if (cameraRef.current && isNavigating && isFollowingUser) {
          // Use heading if available for better direction tracking
          const cameraOptions: any = {
            centerCoordinate: [longitude, latitude],
            zoomLevel: 17.5, // Closer zoom for navigation
            animationDuration: 800, // Smoother, slower following to reduce jitter
          };

          // Add bearing if heading is available (for rotation) - only if accuracy is good
          if (heading !== null && heading !== undefined && !isNaN(heading) && accuracy && accuracy < 20) {
            cameraOptions.bearing = heading;
          }

          // Only update camera if location changed significantly (reduces unnecessary movement)
          if (userLocation) {
            const latDiff = Math.abs(userLocation.lat - latitude);
            const lonDiff = Math.abs(userLocation.lon - longitude);
            const distance = Math.sqrt(latDiff * latDiff + lonDiff * lonDiff) * 111000; // Convert to meters
            
            // Only update if moved more than 5 meters (reduces jitter)
            if (distance > 5) {
              cameraRef.current.setCamera(cameraOptions);
            }
          } else {
            cameraRef.current.setCamera(cameraOptions);
          }
        }
      },
      (error) => {
        console.error("GPS tracking error:", error);
        stopNavigation();
      },
      {
        enableHighAccuracy: true, // Use GPS instead of network
        timeout: 15000,
        maximumAge: 1000, // Allow 1 second old location to reduce jitter
        distanceFilter: 5, // Update every 5 meters (reduces map movement)
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
    setIsFollowingUser(false);
  };

  // Toggle follow user mode
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const toggleFollowUser = () => {
    if (isNavigating) {
      setIsFollowingUser(!isFollowingUser);
      if (!isFollowingUser && userLocation && cameraRef.current) {
        // Center on user when enabling follow mode
        cameraRef.current.setCamera({
          centerCoordinate: [userLocation.lon, userLocation.lat],
          zoomLevel: 17,
          animationDuration: 500,
        });
      }
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchId !== null) {
        Geolocation.clearWatch(watchId);
      }
    };
  }, [watchId]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={DARK_TEAL} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("route_details") || "Route Details"}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Map */}
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={styles.map}
          mapStyle={MAP_STYLE_URL}
          scrollEnabled={!isFollowingUser || !isNavigating}
          rotateEnabled={true}
          pitchEnabled={false}
          logoEnabled={false}
          attributionEnabled={false}
          onRegionDidChange={(feature: any) => {
            try {
              const bearing = feature?.properties?.bearing || 0;
              setMapBearing(bearing);
            } catch (error) {
              console.log("Error getting map bearing:", error);
            }
          }}
        >
          <Camera
            ref={cameraRef}
            defaultSettings={{
              centerCoordinate: userLocation ? [userLocation.lon, userLocation.lat] : [34.83, 31.24],
              zoomLevel: 13,
            }}
            animationMode="flyTo"
          />

          {/* Start Marker - Google Maps style (shown when not navigating) */}
          {userLocation && !isNavigating && (
            <PointAnnotation id="start_location" coordinate={[userLocation.lon, userLocation.lat]}>
              <View style={styles.startMarkerContainer}>
                <View style={styles.startMarkerPin}>
                  <View style={styles.startMarkerCircle}>
                    <Ionicons name="play" size={16} color="#FFFFFF" />
                  </View>
                  <View style={styles.startMarkerShadow} />
                </View>
                <View style={styles.startMarkerLabel}>
                  <Text style={styles.startMarkerLabelText}>{t("start") || "Start"}</Text>
                </View>
              </View>
            </PointAnnotation>
          )}

          {/* User Location Marker - Google Maps style (shown when navigating) */}
          {userLocation && isNavigating && (
            <PointAnnotation id="user_location" coordinate={[userLocation.lon, userLocation.lat]}>
              <View style={styles.userLocationMarkerContainer}>
                {/* Pulsing circle effect */}
                <Animated.View 
                  style={[
                    styles.userLocationPulse,
                    {
                      opacity: pulseAnim1.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.3, 0],
                      }),
                      transform: [
                        {
                          scale: pulseAnim1.interpolate({
                            inputRange: [0, 1],
                            outputRange: [1, 2],
                          }),
                        },
                      ],
                    },
                  ]} 
                />
                <Animated.View 
                  style={[
                    styles.userLocationPulse,
                    {
                      opacity: pulseAnim2.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.3, 0],
                      }),
                      transform: [
                        {
                          scale: pulseAnim2.interpolate({
                            inputRange: [0, 1],
                            outputRange: [1, 2],
                          }),
                        },
                      ],
                    },
                  ]} 
                />
                {/* Main location dot */}
                <View style={styles.userLocationDot}>
                  <View style={styles.userLocationInnerDot} />
                </View>
                {/* Direction indicator when navigating - bigger and clearer */}
                {currentHeading !== null && (
                  <View 
                    style={[
                      styles.userLocationDirection,
                      { transform: [{ rotate: `${currentHeading}deg` }] }
                    ]}
                  >
                    <Ionicons name="navigate" size={18} color="#FFFFFF" />
                  </View>
                )}
              </View>
            </PointAnnotation>
          )}

          {/* End Marker (Destination) - Google Maps style */}
          {destination && (
            <PointAnnotation id="destination" coordinate={[destination.lon, destination.lat]}>
              <View style={styles.endMarkerContainer}>
                <View style={styles.endMarkerPin}>
                  <View style={styles.endMarkerCircle}>
                    <Ionicons name="flag" size={18} color="#FFFFFF" />
                  </View>
                  <View style={styles.endMarkerShadow} />
                </View>
              </View>
            </PointAnnotation>
          )}

          {/* Route Line */}
          {initialRouteCoordinates && (
            <ShapeSource id="route" shape={initialRouteCoordinates}>
              {/* Outline layer for better visibility when navigating */}
              {isNavigating && (
                <LineLayer
                  id="routeLineOutline"
                  style={{
                    lineColor: "#1A73E8", // Darker blue outline
                    lineWidth: 14, // Wider for outline effect
                    lineCap: "round",
                    lineJoin: "round",
                    lineOpacity: 0.4,
                  } as any}
                />
              )}
              {/* Main route line */}
              <LineLayer
                id="routeLine"
                style={{
                  lineColor: isNavigating ? "#4285F4" : DARK_TEAL,
                  lineWidth: isNavigating ? 10 : 5, // Much bigger and cleaner when navigating
                  lineCap: "round",
                  lineJoin: "round",
                  lineOpacity: isNavigating ? 1.0 : 0.8, // Fully opaque when navigating
                } as any}
              />
            </ShapeSource>
          )}
        </MapView>

        {/* Compass - Simple Google Maps style (Right side) */}
        {mapBearing !== 0 && (
          <TouchableOpacity
            style={styles.compassButton}
            onPress={() => {
              // Reset map rotation to 0
              if (cameraRef.current && userLocation) {
                cameraRef.current.setCamera({
                  centerCoordinate: [userLocation.lon, userLocation.lat],
                  zoomLevel: cameraRef.current?.getZoomLevel?.() || 17,
                  bearing: 0,
                  animationDuration: 300,
                });
                setMapBearing(0);
              }
            }}
            activeOpacity={0.8}
          >
            <View style={styles.compassIconContainer}>
              <View 
                style={[
                  styles.compassIcon,
                  { transform: [{ rotate: `${-mapBearing}deg` }] }
                ]}
              >
                <View style={styles.compassNeedle}>
                  <View style={styles.compassNeedleRed} />
                  <View style={styles.compassNeedleWhite} />
                </View>
              </View>
            </View>
          </TouchableOpacity>
        )}

        {/* Re-center Button - Google Maps style (Lower left) */}
        {isNavigating && userLocation && (
          <TouchableOpacity
            style={styles.recenterButton}
            onPress={() => {
              if (userLocation && cameraRef.current) {
                setIsFollowingUser(true);
                cameraRef.current.setCamera({
                  centerCoordinate: [userLocation.lon, userLocation.lat],
                  zoomLevel: 17.5,
                  bearing: currentHeading || 0,
                  animationDuration: 800, // Smoother transition
                });
              }
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="locate" size={20} color="#4285F4" />
            <Text style={styles.recenterButtonText}>{t("recenter") || "Re-centre"}</Text>
          </TouchableOpacity>
        )}

        {/* Floating Action Buttons - Google Maps style (Right side) */}
        <View style={styles.floatingButtons}>
          {/* Show Full Route / Overview Button */}
          <TouchableOpacity
            style={styles.floatingButton}
            onPress={() => {
              if (showFullRoute) {
                // Return to user location or start following
              if (isNavigating && userLocation) {
                setIsFollowingUser(true);
                if (cameraRef.current) {
                  cameraRef.current.setCamera({
                    centerCoordinate: [userLocation.lon, userLocation.lat],
                    zoomLevel: 17.5,
                    bearing: currentHeading || 0,
                    animationDuration: 800, // Smoother transition
                  });
                }
              }
                setShowFullRoute(false);
              } else {
                showFullRouteOverview();
              }
            }}
            activeOpacity={0.8}
          >
            <Ionicons 
              name={showFullRoute ? "locate" : "expand-outline"} 
              size={20} 
              color={DARK_TEAL} 
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Compact Route Info Card */}
      <View style={styles.routeInfoCard}>
        {/* Route Type Indicator - Car */}
        <View style={styles.routeTypeIndicator}>
          <Ionicons name="car" size={20} color={DARK_TEAL} />
          <Text style={styles.routeTypeText}>{t("driving_route") || "Driving Route"}</Text>
        </View>

        {/* Route Summary - Compact */}
        <View style={styles.routeSummary}>
          <View style={styles.routeSummaryItem}>
            <Ionicons name="time-outline" size={18} color={DARK_TEAL} />
            <View style={styles.routeSummaryTextContainer}>
              <Text style={styles.routeSummaryLabel}>{t("time") || "Time"}</Text>
              <Text style={styles.routeSummaryValue}>{formatDuration(routeInfo.duration)}</Text>
            </View>
          </View>
          <View style={styles.routeSummaryDivider} />
          <View style={styles.routeSummaryItem}>
            <Ionicons name="navigate-outline" size={18} color={DARK_TEAL} />
            <View style={styles.routeSummaryTextContainer}>
              <Text style={styles.routeSummaryLabel}>{t("distance") || "Distance"}</Text>
              <Text style={styles.routeSummaryValue}>{formatDistance(routeInfo.distance)}</Text>
            </View>
          </View>
        </View>

        {/* Navigation Controls */}
        <View style={styles.navigationControls}>
          {!isNavigating ? (
            <TouchableOpacity
              style={styles.startNavigationButton}
              onPress={startNavigation}
            >
              <Ionicons name="navigate" size={20} color="#FFFFFF" />
              <Text style={styles.startNavigationButtonText}>
                {t("start_navigation") || "Start Navigation"}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.stopNavigationButton}
              onPress={stopNavigation}
            >
              <Ionicons name="stop-circle" size={20} color="#FFFFFF" />
              <Text style={styles.stopNavigationButtonText}>
                {t("stop_navigation") || "Stop Navigation"}
              </Text>
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
    backgroundColor: "#F2F2F7",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 50 : StatusBar.currentHeight ? StatusBar.currentHeight + 4 : 12,
    paddingBottom: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: DARK_TEAL,
    flex: 1,
    textAlign: "center",
  },
  headerSpacer: {
    width: 40,
  },
  mapContainer: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  // User Location Marker - Google Maps style (Bigger and more obvious)
  userLocationMarkerContainer: {
    alignItems: "center",
    justifyContent: "center",
    width: 70,
    height: 70,
  },
  userLocationPulse: {
    position: "absolute",
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#4285F4",
  },
  userLocationDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 4,
    borderColor: "#4285F4",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#4285F4",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 10,
  },
  userLocationInnerDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#4285F4",
  },
  userLocationDirection: {
    position: "absolute",
    top: -12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#4285F4",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 6,
    zIndex: 11,
  },
  // Start Marker - Google Maps style
  startMarkerContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  startMarkerPin: {
    alignItems: "center",
    justifyContent: "flex-start",
  },
  startMarkerCircle: {
    backgroundColor: "#4CAF50",
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 6,
    zIndex: 2,
  },
  startMarkerShadow: {
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderTopWidth: 14,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#4CAF50",
    marginTop: -3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 1,
  },
  startMarkerLabel: {
    marginTop: 4,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  startMarkerLabelText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#4CAF50",
    letterSpacing: 0.2,
  },
  // End Marker (Destination) - Google Maps style
  endMarkerContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  endMarkerPin: {
    alignItems: "center",
    justifyContent: "flex-start",
  },
  endMarkerCircle: {
    backgroundColor: "#F44336",
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 6,
    zIndex: 2,
  },
  endMarkerShadow: {
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderTopWidth: 14,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#F44336",
    marginTop: -3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 1,
  },
  routeInfoCard: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 30 : 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
    maxHeight: "25%",
  },
  routeTypeIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F0F9FF",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E0F2FE",
  },
  routeTypeText: {
    fontSize: 12,
    fontWeight: "700",
    color: DARK_TEAL,
    marginLeft: 6,
    letterSpacing: 0.3,
  },
  routeSummary: {
    flexDirection: "row",
    backgroundColor: "#F8F9FA",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  routeSummaryItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  routeSummaryTextContainer: {
    marginLeft: 8,
  },
  routeSummaryLabel: {
    fontSize: 10,
    color: "#6B7280",
    fontWeight: "600",
    marginBottom: 2,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  routeSummaryValue: {
    fontSize: 16,
    fontWeight: "700",
    color: DARK_TEAL,
    letterSpacing: -0.2,
  },
  routeSummaryDivider: {
    width: 1,
    height: 35,
    backgroundColor: "#E5E7EB",
    marginHorizontal: 12,
  },
  navigationControls: {
    marginTop: 0,
  },
  startNavigationButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: DARK_TEAL,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  startNavigationButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  stopNavigationButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F44336",
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  stopNavigationButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  // Floating Action Buttons
  floatingButtons: {
    position: "absolute",
    right: 16,
    top: 130,
    gap: 8,
  },
  floatingButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  // Compass - Simple Google Maps style (Right side)
  compassButton: {
    position: "absolute",
    right: 16,
    top: 80,
    zIndex: 1000,
  },
  compassIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  compassIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  compassNeedle: {
    width: 20,
    height: 20,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  compassNeedleRed: {
    position: "absolute",
    top: 0,
    width: 0,
    height: 0,
    borderLeftWidth: 3,
    borderRightWidth: 3,
    borderTopWidth: 10,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#DC2626",
  },
  compassNeedleWhite: {
    position: "absolute",
    bottom: 0,
    width: 0,
    height: 0,
    borderLeftWidth: 3,
    borderRightWidth: 3,
    borderBottomWidth: 10,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#FFFFFF",
  },
  // Re-center Button - Google Maps style (Lower left)
  recenterButton: {
    position: "absolute",
    left: 16,
    bottom: 200,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 1000,
  },
  recenterButtonText: {
    marginLeft: 6,
    fontSize: 13,
    fontWeight: "600",
    color: "#4285F4",
    letterSpacing: 0.2,
  },
});

