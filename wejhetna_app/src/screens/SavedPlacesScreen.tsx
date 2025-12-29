// src/screens/SavedPlacesScreen.tsx

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Alert,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Ionicons from "react-native-vector-icons/Ionicons";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { RootStackParamList } from "../navigation/types";
import { getSavedPlaces, PlaceForMap, unsavePlace } from "../api/places";
import i18n from "../i18n";

const DARK_TEAL = "#0f5b63";
const SOFT_TEAL = "#3a8d96";
const MINT = "#9bd3d8";

type SavedPlacesRoute = RouteProp<RootStackParamList, "SavedPlaces">;
type NavType = NativeStackNavigationProp<RootStackParamList>;

// Helper function to get place name based on language
const getPlaceName = (place: PlaceForMap): string => {
  if (i18n.language === "he" && place.name_he) {
    return place.name_he;
  }
  if (i18n.language === "ar" && place.name_ar) {
    return place.name_ar;
  }
  return place.name_ar || place.name_he || place.name || "";
};

// Helper function to get city name based on language
const getCityName = (city: { name_ar: string; name_he?: string; name_en?: string } | undefined): string => {
  if (!city) return "";
  if (i18n.language === "he" && city.name_he) {
    return city.name_he;
  }
  if (i18n.language === "ar" && city.name_ar) {
    return city.name_ar;
  }
  return city.name_ar || city.name_he || city.name_en || "";
};

// Helper function to get place icon
const getPlaceIcon = (place: PlaceForMap) => {
  const categoryName = place.category?.name_ar?.toLowerCase() || place.category?.name_en?.toLowerCase() || '';
  const iconName = place.category?.icon_name?.toLowerCase() || '';
  
  if (place.place_type === 'PUBLIC_SERVICE') {
    if (categoryName.includes('מסגד') || categoryName.includes('mosque') || iconName.includes('mosque')) {
      return { type: 'mosque', color: '#4285F4' };
    }
    if (categoryName.includes('בית ספר') || categoryName.includes('school') || iconName.includes('school')) {
      return { type: 'school', color: '#34A853' };
    }
    if (categoryName.includes('קופת חולים') || categoryName.includes('clinic') || categoryName.includes('מרפאה') || iconName.includes('clinic') || iconName.includes('hospital')) {
      return { type: 'clinic', color: '#EA4335' };
    }
    if (categoryName.includes('גן ילדים') || categoryName.includes('kindergarten') || iconName.includes('kindergarten')) {
      return { type: 'kindergarten', color: '#FBBC04' };
    }
    if (categoryName.includes('מרכז קהילתי') || categoryName.includes('community') || iconName.includes('community')) {
      return { type: 'community', color: '#9AA0A6' };
    }
    if (categoryName.includes('בית') || categoryName.includes('home') || categoryName.includes('منزل') || iconName.includes('home') || iconName.includes('house')) {
      return { type: 'home', color: '#FF9800' };
    }
    return { type: 'public', color: '#4285F4' };
  }
  
  if (place.place_type === 'BUSINESS') {
    return { type: 'business', color: '#EA4335' };
  }
  
  return { type: 'default', color: '#4285F4' };
};

export default function SavedPlacesScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavType>();
  const route = useRoute<SavedPlacesRoute>();
  const [savedPlaces, setSavedPlaces] = useState<PlaceForMap[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<number | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [unsavingPlaceId, setUnsavingPlaceId] = useState<number | null>(null);

  useEffect(() => {
    async function loadUserInfo() {
      try {
        const storedUserId = await AsyncStorage.getItem("userId");
        const storedUserRole = await AsyncStorage.getItem("userRole");
        if (storedUserId) {
          setUserId(parseInt(storedUserId, 10));
        }
        if (storedUserRole) {
          setUserRole(storedUserRole);
        }
      } catch (error) {
        console.error("Error loading user info:", error);
      }
    }
    loadUserInfo();
  }, []);

  useEffect(() => {
    async function loadSavedPlaces() {
      if (!userId) return;
      
      try {
        setLoading(true);
        const places = await getSavedPlaces(userId);
        setSavedPlaces(places);
      } catch (error) {
        console.error("Error loading saved places:", error);
        Alert.alert(
          t("error") || "שגיאה",
          t("failed_to_load_saved_places") || "נכשל בטעינת המקומות השמורים"
        );
      } finally {
        setLoading(false);
      }
    }
    loadSavedPlaces();
  }, [userId]);

  const handleUnsave = async (placeId: number) => {
    if (!userId) return;
    
    setUnsavingPlaceId(placeId);
    try {
      await unsavePlace(userId, placeId);
      setSavedPlaces(savedPlaces.filter(p => p.id !== placeId));
      Alert.alert(
        t("success") || "הצלחה",
        t("place_removed_from_saved") || "המקום הוסר מהשמורים"
      );
    } catch (error: any) {
      Alert.alert(
        t("error") || "שגיאה",
        error.message || t("failed_to_unsave_place") || "נכשל בהסרת המקום"
      );
    } finally {
      setUnsavingPlaceId(null);
    }
  };

  const handlePlacePress = (place: PlaceForMap) => {
    Alert.alert(
      getPlaceName(place),
      t("view_place_details_question") || "האם תרצה לצפות בנתונים של המקום?",
      [
        {
          text: t("no") || "לא",
          style: "cancel",
        },
        {
          text: t("yes") || "כן",
          onPress: () => {
            // Navigate to map based on user role
            if (!userId) {
              Alert.alert(
                t("error") || "שגיאה",
                t("error_loading_profile") || "Could not load profile"
              );
              return;
            }

            if (userRole === "ADMIN") {
              navigation.navigate("AdminTabs", {
                adminUserId: userId,
                role: "ADMIN",
                selectedPlaceId: place.id,
              });
            } else {
              // For regular users, drivers, business owners - navigate to UserTabs
              navigation.navigate("UserTabs", {
                selectedPlaceId: place.id,
              });
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-forward" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.title}>{t("saved_places") || "מקומות שמורים"}</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={DARK_TEAL} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-forward" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.title}>{t("saved_places") || "מקומות שמורים"}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {savedPlaces.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="bookmark-outline" size={64} color="#999" />
            <Text style={styles.emptyText}>
              {t("no_saved_places") || "אין מקומות שמורים"}
            </Text>
            <Text style={styles.emptySubtext}>
              {t("save_places_to_see_them_here") || "שמור מקומות כדי לראות אותם כאן"}
            </Text>
          </View>
        ) : (
          savedPlaces.map((place) => {
            const placeIcon = getPlaceIcon(place);
            
            return (
              <TouchableOpacity
                key={place.id}
                style={styles.placeCard}
                onPress={() => handlePlacePress(place)}
              >
                {/* Place Image */}
                {place.main_image_url ? (
                  <Image
                    source={{ uri: place.main_image_url }}
                    style={styles.placeImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.placeImagePlaceholder}>
                    <View style={[styles.iconContainer, { backgroundColor: placeIcon.color }]}>
                      {place.place_type === 'PUBLIC_SERVICE' && (
                        <>
                          {placeIcon.type === 'mosque' && (
                            <MaterialCommunityIcons name="mosque" size={24} color="#FFFFFF" />
                          )}
                          {placeIcon.type === 'school' && (
                            <Ionicons name="school" size={24} color="#FFFFFF" />
                          )}
                          {placeIcon.type === 'clinic' && (
                            <MaterialCommunityIcons name="hospital-building" size={24} color="#FFFFFF" />
                          )}
                          {placeIcon.type === 'kindergarten' && (
                            <MaterialCommunityIcons name="baby-face-outline" size={24} color="#FFFFFF" />
                          )}
                          {placeIcon.type === 'community' && (
                            <MaterialCommunityIcons name="account-group" size={24} color="#FFFFFF" />
                          )}
                          {placeIcon.type === 'home' && (
                            <Ionicons name="home" size={24} color="#FFFFFF" />
                          )}
                          {placeIcon.type === 'public' && (
                            <Ionicons name="location" size={24} color="#FFFFFF" />
                          )}
                        </>
                      )}
                      {place.place_type === 'BUSINESS' && (
                        <Ionicons name="business" size={24} color="#FFFFFF" />
                      )}
                    </View>
                  </View>
                )}

                {/* Place Info */}
                <View style={styles.placeInfo}>
                  <View style={styles.placeHeader}>
                    <Text style={styles.placeName} numberOfLines={2}>
                      {getPlaceName(place)}
                    </Text>
                    <TouchableOpacity
                      style={styles.unsaveButton}
                      onPress={() => handleUnsave(place.id)}
                      disabled={unsavingPlaceId === place.id}
                    >
                      {unsavingPlaceId === place.id ? (
                        <ActivityIndicator size="small" color={DARK_TEAL} />
                      ) : (
                        <Ionicons name="bookmark" size={24} color={DARK_TEAL} />
                      )}
                    </TouchableOpacity>
                  </View>

                  <View style={styles.placeDetails}>
                    <View style={styles.detailRow}>
                      <Ionicons name="location-outline" size={16} color="#666" />
                      <Text style={styles.detailText}>
                        {getCityName(place.city)}
                      </Text>
                    </View>

                    {place.category && (
                      <View style={styles.detailRow}>
                        <MaterialCommunityIcons 
                          name={place.category.icon_name as any || "tag"} 
                          size={16} 
                          color="#666" 
                        />
                        <Text style={styles.detailText}>
                          {i18n.language === "he" && place.category.name_he
                            ? place.category.name_he
                            : i18n.language === "ar" && place.category.name_ar
                            ? place.category.name_ar
                            : place.category.name_ar || place.category.name_he || ""}
                        </Text>
                      </View>
                    )}

                    {place.phone && (
                      <View style={styles.detailRow}>
                        <Ionicons name="call-outline" size={16} color="#666" />
                        <Text style={styles.detailText}>{place.phone}</Text>
                      </View>
                    )}

                    {place.opening_hours && (
                      <View style={styles.detailRow}>
                        <Ionicons name="time-outline" size={16} color="#666" />
                        <Text style={styles.detailText}>{place.opening_hours}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
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
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    flex: 1,
    textAlign: "center",
  },
  headerSpacer: {
    width: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 80,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: "600",
    color: "#666",
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#999",
    marginTop: 8,
    textAlign: "center",
  },
  placeCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    marginBottom: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  placeImage: {
    width: "100%",
    height: 200,
    backgroundColor: "#F2F2F7",
  },
  placeImagePlaceholder: {
    width: "100%",
    height: 200,
    backgroundColor: "#F2F2F7",
    alignItems: "center",
    justifyContent: "center",
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  placeInfo: {
    padding: 16,
  },
  placeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  placeName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#000",
    flex: 1,
    marginRight: 12,
  },
  unsaveButton: {
    padding: 4,
  },
  placeDetails: {
    gap: 8,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  detailText: {
    fontSize: 14,
    color: "#666",
  },
});

