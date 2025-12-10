// src/screens/AdminCategoriesScreen.tsx

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

type Category = {
  id: number;
  name_ar: string;
  name_he?: string | null;
  name_en?: string | null;
  created_at: string;
  updated_at: string;
};

const API_BASE_URL = "http://10.0.2.2:8000";
type AdminCategoriesRoute = RouteProp<RootStackParamList, "AdminCategories">;

export default function AdminCategoriesScreen() {
  const route = useRoute<AdminCategoriesRoute>();
  const { adminUserId, role } = route.params;

  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [nameAr, setNameAr] = useState<string>("");
  const [nameHe, setNameHe] = useState<string>("");
  const [nameEn, setNameEn] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);

  // ----------------------
  // Load categories
  // ----------------------
  const loadCategories = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/admin/categories`);
      if (!res.ok) {
        throw new Error("Failed to fetch");
      }
      const data: Category[] = await res.json();
      setCategories(data);
    } catch {
      Alert.alert("Error", "Failed to load categories");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  // ----------------------
  // Open modal – new category
  // ----------------------
  const openNewCategoryModal = () => {
    setEditingCategory(null);
    setNameAr("");
    setNameHe("");
    setNameEn("");
    setModalVisible(true);
  };

  // ----------------------
  // Open modal – edit category
  // ----------------------
  const openEditCategoryModal = (cat: Category) => {
    setEditingCategory(cat);
    setNameAr(cat.name_ar || "");
    setNameHe(cat.name_he || "");
    setNameEn(cat.name_en || "");
    setModalVisible(true);
  };

  // ----------------------
  // Save (create / update)
  // ----------------------
  const handleSaveCategory = async () => {
    const trimmedAr = nameAr.trim();
    const trimmedHe = nameHe.trim();
    const trimmedEn = nameEn.trim();

    if (!trimmedAr) {
      Alert.alert("Validation", "Arabic name is required.");
      return;
    }

    try {
      const payload = {
        name_ar: trimmedAr,
        name_he: trimmedHe || null,
        name_en: trimmedEn || null,
        // is_active: true  // אפשר להשאיר כברירת מחדל בבקאנד
      };

      let url = `${API_BASE_URL}/admin/categories`;
      let method: "POST" | "PUT" = "POST";

      if (editingCategory) {
        url = `${API_BASE_URL}/admin/categories/${editingCategory.id}`;
        method = "PUT";
      }

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error("Request failed");
      }

      setModalVisible(false);
      setEditingCategory(null);
      setNameAr("");
      setNameHe("");
      setNameEn("");

      await loadCategories();
    } catch {
      Alert.alert("Error", "Failed to save category");
    }
  };

  const renderCategoryItem = ({ item }: { item: Category }) => {
    const hasTranslations = !!item.name_he || !!item.name_en;

    return (
      <TouchableOpacity
        style={styles.categoryItem}
        onPress={() => openEditCategoryModal(item)}
      >
        <Text style={styles.categoryNameAr}>{item.name_ar}</Text>

        {hasTranslations && (
          <Text style={styles.categoryTranslations}>
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
      {/* Title */}
      <Text style={styles.title}>Categories</Text>
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

      {/* List */}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={categories}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderCategoryItem}
          contentContainerStyle={
            categories.length === 0 ? styles.emptyListContainer : undefined
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>No categories yet</Text>
          }
        />
      )}

      {/* Add button */}
      <View style={styles.addButtonWrapper}>
        <TouchableOpacity
          style={styles.addButton}
          onPress={openNewCategoryModal}
        >
          <Text style={styles.addButtonText}>+ Add Category</Text>
        </TouchableOpacity>
      </View>

      {/* Modal – create / edit */}
      <Modal
        visible={modalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {editingCategory ? "Edit Category" : "New Category"}
            </Text>

            {/* Arabic – required */}
            <Text style={styles.modalLabel}>
              Name (Arabic) <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={styles.input}
              placeholder="اسم بالعربية"
              value={nameAr}
              onChangeText={setNameAr}
            />

            {/* Hebrew */}
            <Text style={styles.modalLabel}>Name (Hebrew)</Text>
            <TextInput
              style={styles.input}
              placeholder="שם בעברית (לא חובה)"
              value={nameHe}
              onChangeText={setNameHe}
            />

            {/* English */}
            <Text style={styles.modalLabel}>Name (English)</Text>
            <TextInput
              style={styles.input}
              placeholder="Name in English (optional)"
              value={nameEn}
              onChangeText={setNameEn}
            />

            {/* Buttons */}
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleSaveCategory}
            >
              <Text style={styles.primaryButtonText}>
                {editingCategory ? "Save" : "Create"}
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

// ----------------------
// Styles
// ----------------------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F5",
    paddingTop: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 12,
  },
  categoryItem: {
    backgroundColor: "#FFFFFF",
    marginHorizontal: 16,
    marginVertical: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    elevation: 1,
  },
  categoryNameAr: {
    fontSize: 18,
    fontWeight: "700",
  },
  categoryTranslations: {
    marginTop: 4,
    fontSize: 14,
    color: "#555",
  },
  editHint: {
    marginTop: 6,
    fontSize: 12,
    color: "#999",
  },
  emptyListContainer: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    color: "#777",
  },
  addButtonWrapper: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  addButton: {
    backgroundColor: "#1E7D32",
    borderRadius: 30,
    paddingVertical: 14,
    alignItems: "center",
  },
  addButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
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
    paddingHorizontal: 18,
    paddingVertical: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 16,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: "500",
    marginTop: 8,
    marginBottom: 4,
  },
  required: {
    color: "red",
  },
  input: {
    borderWidth: 1,
    borderColor: "#DDD",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#FAFAFA",
  },
  primaryButton: {
    marginTop: 18,
    backgroundColor: "#0066FF",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
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
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  cancelButtonText: {
    color: "#333",
    fontSize: 15,
  },
});
