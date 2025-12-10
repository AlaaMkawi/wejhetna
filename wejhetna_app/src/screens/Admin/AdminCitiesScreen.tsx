// src/screens/AdminCitiesScreen.tsx

import React, { useEffect, useState } from "react";
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
import { useRoute, RouteProp } from "@react-navigation/native";
import { RootStackParamList } from "../../navigation/types";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

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
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const route = useRoute<AdminCitiesRoute>();
  const { adminUserId, role } = route.params;
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [editingCity, setEditingCity] = useState<City | null>(null);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [nameAr, setNameAr] = useState<string>("");
  const [nameHe, setNameHe] = useState<string>("");
  const [nameEn, setNameEn] = useState<string>("");

  // Load cities
  const loadCities = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/admin/cities`);
      if (!res.ok) throw new Error("Failed fetching cities");
      const data: City[] = await res.json();
      setCities(data);
    } catch {
      Alert.alert("Error", "Failed to load cities");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCities();
  }, []);

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
      Alert.alert("Validation", "Arabic city name is required.");
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

      if (!res.ok) throw new Error("Network or validation error");

      setModalVisible(false);
      setEditingCity(null);
      setNameAr("");
      setNameHe("");
      setNameEn("");

      await loadCities();
    } catch {
      Alert.alert("Error", "Failed to save city");
    }
  };

  const renderCityItem = ({ item }: { item: City }) => {
    const hasTranslations = item.name_he || item.name_en;

    return (
      <TouchableOpacity
        style={styles.itemCard}
        onPress={() => openEditCityModal(item)}
      >
        <Text style={styles.nameAr}>{item.name_ar}</Text>

        {hasTranslations && (
          <Text style={styles.translations}>
            {item.name_he ? `HE: ${item.name_he}` : ""}
            {item.name_he && item.name_en ? "   |   " : ""}
            {item.name_en ? `EN: ${item.name_en}` : ""}
          </Text>
        )}

        <Text style={styles.editHint}>Tap to edit</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Cities</Text>
      <TouchableOpacity
        style={styles.backButton}
        onPress={() =>
          navigation.reset({              
            routes: [
                {
                  name: "AdminTabs",
                  params: { adminUserId, role },
                },
              ],
          })
        }
      >
        <Text style={styles.backButtonText}>← חזרה לבית</Text>
      </TouchableOpacity>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={cities}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderCityItem}
          contentContainerStyle={
            cities.length === 0 ? styles.emptyListContainer : undefined
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>No cities yet</Text>
          }
        />
      )}

      {/* Add City button */}
      <View style={styles.addButtonWrapper}>
        <TouchableOpacity style={styles.addButton} onPress={openNewCityModal}>
          <Text style={styles.addButtonText}>+ Add City</Text>
        </TouchableOpacity>
      </View>

      {/* Modal */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {editingCity ? "Edit City" : "New City"}
            </Text>

            {/* Arabic (required) */}
            <Text style={styles.modalLabel}>
              Name (Arabic) <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={styles.input}
              placeholder="اسم المدينة"
              value={nameAr}
              onChangeText={setNameAr}
            />

            <Text style={styles.modalLabel}>Name (Hebrew)</Text>
            <TextInput
              style={styles.input}
              placeholder="שם בעברית"
              value={nameHe}
              onChangeText={setNameHe}
            />

            <Text style={styles.modalLabel}>Name (English)</Text>
            <TextInput
              style={styles.input}
              placeholder="City in English"
              value={nameEn}
              onChangeText={setNameEn}
            />

            <TouchableOpacity style={styles.primaryButton} onPress={handleSaveCity}>
              <Text style={styles.primaryButtonText}>
                {editingCity ? "Save" : "Create"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// Styles
const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 16, backgroundColor: "#F5F5F5" },
  title: { fontSize: 24, fontWeight: "700", textAlign: "center", marginBottom: 12 },
  itemCard: {
    backgroundColor: "#FFF",
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 12,
    borderRadius: 10,
    elevation: 1,
  },
  nameAr: { fontSize: 18, fontWeight: "700" },
  translations: { marginTop: 4, color: "#555" },
  editHint: { marginTop: 6, fontSize: 12, color: "#999" },
  emptyListContainer: { flexGrow: 1, justifyContent: "center", alignItems: "center" },
  emptyText: { color: "#777" },

  addButtonWrapper: { paddingHorizontal: 16, paddingVertical: 12 },
  addButton: {
    backgroundColor: "#1E7D32",
    paddingVertical: 14,
    borderRadius: 30,
    alignItems: "center",
  },
  addButtonText: { color: "#FFF", fontSize: 16, fontWeight: "600" },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalCard: {
    width: "88%",
    backgroundColor: "#FFF",
    borderRadius: 18,
    padding: 18,
  },
  modalTitle: { fontSize: 20, fontWeight: "700", marginBottom: 16 },
  modalLabel: { marginTop: 8, marginBottom: 4, fontWeight: "500" },
  required: { color: "red" },

  input: {
    borderWidth: 1,
    borderColor: "#DDD",
    borderRadius: 8,
    padding: 8,
    backgroundColor: "#FAFAFA",
  },

  primaryButton: {
    marginTop: 18,
    backgroundColor: "#0066FF",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  primaryButtonText: { color: "#FFF", fontSize: 16, fontWeight: "600" },
  backButton: {
    alignSelf: "flex-start",
    marginLeft: 16,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#E0E0E0",
    borderRadius: 8,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },

  cancelButton: {
    marginTop: 10,
    backgroundColor: "#E0E0E0",
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  cancelButtonText: { color: "#333" },
});
