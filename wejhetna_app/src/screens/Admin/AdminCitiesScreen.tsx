// src/screens/AdminCitiesScreen.tsx

import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useTranslation } from "react-i18next";
import i18n from "../../i18n";
import { useRoute, RouteProp } from "@react-navigation/native";
import { RootStackParamList } from "../../navigation/types";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import SwipeableRow from "../../components/SwipeableRow";

type City = {
  id: number;
  name_ar: string;
  name_he?: string | null;
  name_en?: string | null;
  created_at: string;
  updated_at: string;
};

const API_BASE_URL = "http://10.0.2.2:8000";
type AdminCitiesRoute = RouteProp<RootStackParamList, "AdminCities">;

export default function AdminCitiesScreen() {
  const { t } = useTranslation();
  const route = useRoute<AdminCitiesRoute>();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { adminUserId, role } = route.params;
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [editingCity, setEditingCity] = useState<City | null>(null);
  const [nameAr, setNameAr] = useState<string>("");
  const [nameHe, setNameHe] = useState<string>("");
  const [nameEn, setNameEn] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filteredCities, setFilteredCities] = useState<City[]>([]);

  // Load cities
  const loadCities = useCallback(async () => {
    try {
      setLoading(true);
      
      // סנכרון הערים לקבצי התרגום
      try {
        await fetch(`${API_BASE_URL}/admin/translations/sync-cities`, {
          method: "POST",
        });
      } catch (syncError) {
        // אם הסנכרון נכשל, נמשיך בכל זאת לטעון את הערים
        console.warn("Failed to sync cities to translations:", syncError);
      }
      
      const res = await fetch(`${API_BASE_URL}/admin/cities`);
      if (!res.ok) {
        throw new Error("Failed to fetch");
      }
      const data: City[] = await res.json();
      setCities(data);
      setFilteredCities(data);
    } catch {
      Alert.alert(t("error") || "Error", t("failed_to_load_cities") || "Failed to load cities");
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadCities();
  }, [loadCities]);

  // Filter cities based on search query
  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredCities(cities);
    } else {
      const filtered = cities.filter((city) => {
        const query = searchQuery.toLowerCase();
        return (
          city.name_ar?.toLowerCase().includes(query) ||
          city.name_he?.toLowerCase().includes(query) ||
          city.name_en?.toLowerCase().includes(query)
        );
      });
      setFilteredCities(filtered);
    }
  }, [searchQuery, cities]);

  // Open modal — add city
  const openNewCityModal = () => {
    setEditingCity(null);
    setNameAr("");
    setNameHe("");
    setNameEn("");
    setModalVisible(true);
  };

  // Open modal — edit city
  const openEditCityModal = (city: City) => {
    setEditingCity(city);
    setNameAr(city.name_ar || "");
    setNameHe(city.name_he || "");
    setNameEn(city.name_en || "");
    setModalVisible(true);
  };

  // Save create/update
  const handleSaveCity = async () => {
    const trimmedAr = nameAr.trim();
    const trimmedHe = nameHe.trim();
    const trimmedEn = nameEn.trim();

    if (!trimmedAr) {
      Alert.alert(t("validation") || "Validation", t("arabic_name_required") || "Arabic name is required.");
      return;
    }

    if (!trimmedEn) {
      Alert.alert(t("validation") || "Validation", t("english_name_required") || "English name is required.");
      return;
    }

    if (!trimmedHe) {
      Alert.alert(t("validation") || "Validation", t("hebrew_name_required") || "Hebrew name is required.");
      return;
    }

    try {
      const payload = {
        name_ar: trimmedAr,
        name_he: trimmedHe || null,
        name_en: trimmedEn || null,
      };

      let url = `${API_BASE_URL}/admin/cities`;
      let method: "POST" | "PUT" = "POST";

      if (editingCity) {
        url = `${API_BASE_URL}/admin/cities/${editingCity.id}`;
        method = "PUT";
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error("Request failed");
      }

      setModalVisible(false);
      setEditingCity(null);
      setNameAr("");
      setNameHe("");
      setNameEn("");

      await loadCities();
    } catch {
      Alert.alert(t("error") || "Error", t("failed_to_save_city") || "Failed to save city");
    }
  };

  const handleDeleteCityFromList = async (city: City) => {
    Alert.alert(
      t("delete_city") || "Delete City",
      `${t("delete_city_confirmation") || "Are you sure you want to delete the city"} "${city.name_ar}"?`,
      [
        {
          text: t("cancel") || "Cancel",
          style: "cancel",
        },
        {
          text: t("delete") || "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const res = await fetch(
                `${API_BASE_URL}/admin/cities/${city.id}`,
                {
                  method: "DELETE",
                  headers: {
                    "Content-Type": "application/json",
                  },
                }
              );

              if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.detail || t("failed_to_delete_city") || "Failed to delete city");
              }

              await loadCities();
              Alert.alert(t("success") || "Success", t("city_deleted_successfully") || "City deleted successfully");
            } catch (error: any) {
              Alert.alert(t("error") || "Error", error.message || t("failed_to_delete_city") || "Failed to delete city");
            }
          },
        },
      ]
    );
  };

  const renderCityItem = ({ item }: { item: City }) => {
    // Use the name according to the current language from the database
    // This ensures we always show the latest updated name
    const currentLanguage = i18n.language || "ar";
    let displayTitle = "";
    
    if (currentLanguage === "he" && item.name_he) {
      displayTitle = item.name_he;
    } else if (currentLanguage === "ar" && item.name_ar) {
      displayTitle = item.name_ar;
    } else if (item.name_en) {
      displayTitle = item.name_en;
    } else {
      // Fallback to any available name
      displayTitle = item.name_ar || item.name_he || item.name_en || "";
    }

    return (
      <SwipeableRow onDelete={() => handleDeleteCityFromList(item)}>
        <View style={styles.cityItemContainer}>
          <TouchableOpacity
            style={styles.cityItem}
            onPress={() => openEditCityModal(item)}
          >
            <Text style={styles.nameAr}>{displayTitle}</Text>

            <Text style={styles.translations}>
              {item.name_he ? `${item.name_he} | ` : ""}
              {item.name_ar ? `${item.name_ar} | ` : ""}
              {item.name_en || ""}
            </Text>

            <Text style={styles.editHint}>{t("tap_to_edit") || "Tap to edit"}</Text>
          </TouchableOpacity>
          <View style={styles.separator} />
        </View>
      </SwipeableRow>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-forward" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.title}>{t("cities") || "Cities"}</Text>
          <TouchableOpacity
            style={styles.addButtonHeader}
            onPress={openNewCityModal}
          >
            <Ionicons name="add" size={20} color="#0f5b63" />
            <Text style={styles.addButtonTextHeader}>{t("add") || "Add"}</Text>
          </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder={t("search") || "Search"}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#999"
          />
        </View>
        <TouchableOpacity style={styles.searchButton}>
          <Ionicons name="search" size={20} color="#0f5b63" />
        </TouchableOpacity>
      </View>

      {/* List */}
      {loading ? (
        <ActivityIndicator style={styles.loadingIndicator} />
      ) : (
        <FlatList
          data={filteredCities}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderCityItem}
          style={styles.listContainer}
          contentContainerStyle={
            filteredCities.length === 0 ? styles.emptyListContainer : undefined
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>{t("no_cities_yet") || "No cities yet"}</Text>
          }
        />
      )}

      {/* Modal */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {editingCity ? (t("edit_city") || "Edit City") : (t("new_city") || "New City")}
            </Text>

            {/* Arabic (required) */}
            <Text style={styles.modalLabel}>
              {t("name_arabic") || "Name (Arabic)"} <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={styles.input}
              placeholder={t("city_name_arabic") || "اسم المدينة"}
              value={nameAr}
              onChangeText={setNameAr}
              placeholderTextColor="#999"
            />

            <Text style={styles.modalLabel}>
              {t("name_hebrew") || "Name (Hebrew)"} <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={styles.input}
              placeholder={t("city_name_hebrew") || "שם בעברית"}
              value={nameHe}
              onChangeText={setNameHe}
              placeholderTextColor="#999"
            />

            <Text style={styles.modalLabel}>
              {t("name_english") || "Name (English)"} <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={styles.input}
              placeholder={t("city_name_english") || "City in English"}
              value={nameEn}
              onChangeText={setNameEn}
              placeholderTextColor="#999"
            />

            {/* Buttons */}
            <View style={styles.modalButtonsContainer}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>{t("cancel") || "Cancel"}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryButton} onPress={handleSaveCity}>
                <Text style={styles.primaryButtonText}>
                  {editingCity ? (t("save") || "Save") : (t("create") || "Create")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// Styles
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
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
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    flex: 1,
    textAlign: "center",
    marginTop: 6,
  },
  backButton: {
    padding: 4,
    marginRight: 8,
  },
  addButtonHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 30,
    paddingHorizontal: 12,
    marginLeft: 8,
  },
  addButtonTextHeader: {
    color: "#0f5b63",
    fontSize: 20,
    fontWeight: "600",
    marginLeft: 4,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 12,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    height: 50,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  searchInputContainer: {
    flex: 1,
    height: "100%",
    justifyContent: "center",
    paddingLeft: 20,
    backgroundColor: "#FFFFFF",
  },
  searchInput: {
    fontSize: 16,
    color: "#000",
    padding: 0,
    width: "100%",
  },
  searchButton: {
    backgroundColor: "#FFFFFF",
    width: 60,
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    borderTopRightRadius: 30,
    borderBottomRightRadius: 30,
  },
  cityItemContainer: {
    backgroundColor: "#FFFFFF",
  },
  cityItem: {
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  separator: {
    height: 1,
    backgroundColor: "#9bd3d8",
    marginLeft: 16,
    marginRight: 16,
    opacity: 0.4,
  },
  nameAr: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1A1A1A",
    marginBottom: 4,
  },
  translations: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 2,
  },
  editHint: {
    marginTop: 4,
    fontSize: 12,
    color: "#999",
  },
  listContainer: {
    backgroundColor: "#FFFFFF",
  },
  emptyListContainer: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    color: "#777",
  },
  loadingIndicator: {
    marginTop: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalCard: {
    width: "90%",
    maxWidth: 400,
    backgroundColor: "#FFF",
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingVertical: 28,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 24,
    color: "#1A1A1A",
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: "600",
    marginTop: 16,
    marginBottom: 8,
    color: "#333",
  },
  required: {
    color: "#dc3545",
  },
  input: {
    borderWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: "#8593adff",
    borderRadius: 0,
    paddingHorizontal: 0,
    paddingVertical: 12,
    backgroundColor: "transparent",
    fontSize: 16,
    color: "#000",
  },
  modalButtonsContainer: {
    flexDirection: "row",
    marginTop: 24,
    gap: 12,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: "#d7e9eaff",
    borderRadius: 30,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#255156ff",
  },
  primaryButtonText: {
    color: "#255156ff",
    fontSize: 16,
    fontWeight: "600",
  },
  cancelButton: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 30,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#0f5b63",
  },
  cancelButtonText: {
    color: "#0f5b63",
    fontSize: 16,
    fontWeight: "600",
  },
});
