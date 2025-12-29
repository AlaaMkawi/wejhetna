// src/screens/AdminCategoriesScreen.tsx

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
  ScrollView,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import { useTranslation } from "react-i18next";
import i18n from "../../i18n";
import { useRoute, RouteProp } from "@react-navigation/native";
import { RootStackParamList } from "../../navigation/types";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import SwipeableRow from "../../components/SwipeableRow";

type Category = {
  id: number;
  name_ar: string;
  name_he?: string | null;
  name_en?: string | null;
  icon_name?: string | null;
  is_active?: boolean;
  created_at: string;
  updated_at: string;
};

const API_BASE_URL = "http://10.0.2.2:8000";
type AdminCategoriesRoute = RouteProp<RootStackParamList, "AdminCategories">;

export default function AdminCategoriesScreen() {
  const { t } = useTranslation();
  const route = useRoute<AdminCategoriesRoute>();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { adminUserId, role } = route.params;

  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [nameAr, setNameAr] = useState<string>("");
  const [nameHe, setNameHe] = useState<string>("");
  const [nameEn, setNameEn] = useState<string>("");
  const [iconName, setIconName] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filteredCategories, setFilteredCategories] = useState<Category[]>([]);

  // רשימת אייקונים מומלצים לקטגוריות - MaterialCommunityIcons
  // מגוון רחב של אייקונים מתאימים למקומות עסקים ומקומות ציבוריים
  // ניתן לחפש עוד אייקונים ב: https://pictogrammers.com/library/mdi/
  const recommendedIcons = [
    // מסעדות וקפיטריות
    "silverware-fork-knife", "coffee", "pizza", "food", "food-variant",
    // חנויות ומסחר (חנות בגדים, סופרמרקט, וכו')
    "store", "shopping", "tshirt-crew", "basket", "cart",
    // חינוך ומוסדות לימוד
    "school", "school-outline", "library", "book-open-page-variant", "book-education",
    // גן ילדים
    "human-child", "baby-face-outline", "toy-brick", "crayon",
    // בריאות ורפואה (בית חולים, מרפאה, קליניקה)
    "hospital-building", "medical-bag", "doctor", "pill", "hospital-box",
    // פארקים וטבע
    "tree", "flower", "leaf", "park", "nature",
    // ספורט (מתקן ספורט, מגרש)
    "soccer", "basketball", "dumbbell", "run",
    // שירותים ציבוריים
    "email", "archive", "file-document", "office-building", "city-variant",
    // קהילה ודת (מרכז קהילתי, מסגד, בית כנסת, כנסייה)
    "account-group", "home", "mosque", "church", "synagogue",
    // תחבורה
    "car", "bus", "train", "bicycle"
  ];

  // ----------------------
  // Load categories
  // ----------------------
  const loadCategories = useCallback(async () => {
    try {
      setLoading(true);
      
      // סנכרון הקטגוריות לקבצי התרגום
      try {
        await fetch(`${API_BASE_URL}/admin/translations/sync-categories`, {
          method: "POST",
        });
      } catch (syncError) {
        // אם הסנכרון נכשל, נמשיך בכל זאת לטעון את הקטגוריות
        console.warn("Failed to sync categories to translations:", syncError);
      }
      
      const res = await fetch(`${API_BASE_URL}/admin/categories`);
      if (!res.ok) {
        throw new Error("Failed to fetch");
      }
      const data: Category[] = await res.json();
      setCategories(data);
      setFilteredCategories(data);
    } catch {
      Alert.alert(t("error") || "Error", t("failed_to_load_categories") || "Failed to load categories");
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  // Filter categories based on search query
  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredCategories(categories);
    } else {
      const filtered = categories.filter((cat) => {
        const query = searchQuery.toLowerCase();
        return (
          cat.name_ar?.toLowerCase().includes(query) ||
          cat.name_he?.toLowerCase().includes(query) ||
          cat.name_en?.toLowerCase().includes(query)
        );
      });
      setFilteredCategories(filtered);
    }
  }, [searchQuery, categories]);

  // ----------------------
  // Open modal – new category
  // ----------------------
  const openNewCategoryModal = () => {
    setEditingCategory(null);
    setNameAr("");
    setNameHe("");
    setNameEn("");
    setIconName("");
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
    setIconName(cat.icon_name || "");
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
        icon_name: iconName.trim() || null,
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
      setIconName("");

      await loadCategories();
      
      // הסנכרון מתבצע אוטומטית ב-backend כששומרים קטגוריה
      // לא צריך לקרוא ל-updateTranslationFiles כאן
    } catch {
      Alert.alert(t("error") || "Error", t("failed_to_save_category") || "Failed to save category");
    }
  };

  // ----------------------
  // Delete category (not used in modal, deletion is done via swipe)
  // ----------------------
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleDeleteCategory = async () => {
    if (!editingCategory) return;

    Alert.alert(
      "מחיקת קטגוריה",
      `האם אתה בטוח שברצונך למחוק את הקטגוריה "${editingCategory.name_ar}"?`,
      [
        {
          text: "ביטול",
          style: "cancel",
        },
        {
          text: "מחק",
          style: "destructive",
          onPress: async () => {
            try {
              const res = await fetch(
                `${API_BASE_URL}/admin/categories/${editingCategory.id}`,
                {
                  method: "DELETE",
                  headers: {
                    "Content-Type": "application/json",
                  },
                }
              );

              if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.detail || "Failed to delete category");
              }

              setModalVisible(false);
              setEditingCategory(null);
              setNameAr("");
              setNameHe("");
              setNameEn("");

              await loadCategories();
              Alert.alert("הצלחה", "הקטגוריה נמחקה בהצלחה");
            } catch (error: any) {
              Alert.alert("שגיאה", error.message || "Failed to delete category");
            }
          },
        },
      ]
    );
  };

  const handleDeleteCategoryFromList = async (category: Category) => {
    Alert.alert(
      t("delete_category") || "Delete Category",
      t("delete_category_confirmation", { name: category.name_ar }) || `Are you sure you want to delete the category "${category.name_ar}"?`,
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
                `${API_BASE_URL}/admin/categories/${category.id}`,
                {
                  method: "DELETE",
                  headers: {
                    "Content-Type": "application/json",
                  },
                }
              );

              if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.detail || "Failed to delete category");
              }

              await loadCategories();
              Alert.alert("הצלחה", "הקטגוריה נמחקה בהצלחה");
            } catch (error: any) {
              Alert.alert("שגיאה", error.message || "Failed to delete category");
            }
          },
        },
      ]
    );
  };

  const renderCategoryItem = ({ item }: { item: Category }) => {
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
      <SwipeableRow onDelete={() => handleDeleteCategoryFromList(item)}>
        <View style={styles.categoryItemContainer}>
          <TouchableOpacity
            style={styles.categoryItem}
            onPress={() => openEditCategoryModal(item)}
          >
            <View style={styles.categoryItemHeader}>
              {item.icon_name && (
                <MaterialCommunityIcons 
                  name={item.icon_name as any} 
                  size={24} 
                  color="#0f5b63" 
                  style={styles.categoryIcon}
                />
              )}
              <Text style={styles.categoryNameAr}>{displayTitle}</Text>
            </View>

            <Text style={styles.categoryTranslations}>
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
        <Text style={styles.title}>{t("categories") || "Categories"}</Text>
        <TouchableOpacity
          style={styles.addButtonHeader}
          onPress={openNewCategoryModal}
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
          data={filteredCategories}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderCategoryItem}
          style={styles.listContainer}
          contentContainerStyle={
            filteredCategories.length === 0 ? styles.emptyListContainer : undefined
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>{t("no_categories_yet") || "No categories yet"}</Text>
          }
        />
      )}

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
              {editingCategory ? t("edit_category") || "Edit Category" : t("new_category") || "New Category"}
            </Text>

            {/* Arabic – required */}
            <Text style={styles.modalLabel}>
              {t("name_arabic") || "Name (Arabic)"} <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={styles.input}
              placeholder={t("enter_arabic_name") || "اسم بالعربية"}
              value={nameAr}
              onChangeText={setNameAr}
              placeholderTextColor="#999"
            />

            {/* Hebrew – required */}
            <Text style={styles.modalLabel}>
              {t("name_hebrew") || "Name (Hebrew)"} <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={styles.input}
              placeholder={t("enter_hebrew_name") || "שם בעברית"}
              value={nameHe}
              onChangeText={setNameHe}
              placeholderTextColor="#999"
            />

            {/* English – required */}
            <Text style={styles.modalLabel}>
              {t("name_english") || "Name (English)"} <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={styles.input}
              placeholder={t("enter_english_name") || "Name in English"}
              value={nameEn}
              onChangeText={setNameEn}
              placeholderTextColor="#999"
            />

            {/* Icon Selection */}
            <Text style={styles.modalLabel}>
              {t("category_icon") || "Category Icon"} ({t("optional") || "(Optional)"})
            </Text>
            <View style={styles.iconPickerContainer}>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                style={styles.iconScrollView}
                contentContainerStyle={styles.iconScrollContent}
              >
                {recommendedIcons.map((icon) => (
                  <TouchableOpacity
                    key={icon}
                    style={[
                      styles.iconOption,
                      iconName === icon && styles.iconOptionSelected
                    ]}
                    onPress={() => setIconName(icon === iconName ? "" : icon)}
                  >
                    <MaterialCommunityIcons 
                      name={icon as any} 
                      size={24} 
                      color={iconName === icon ? "#0f5b63" : "#666"} 
                    />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            {iconName && (
              <View style={styles.selectedIconContainer}>
                <MaterialCommunityIcons name={iconName as any} size={20} color="#0f5b63" />
                <Text style={styles.selectedIconText}>
                  {t("selected_icon") || "Selected"}: {iconName}
                </Text>
                <TouchableOpacity onPress={() => setIconName("")}>
                  <MaterialCommunityIcons name="close-circle" size={20} color="#999" />
                </TouchableOpacity>
              </View>
            )}

            {/* Buttons */}
            <View style={styles.modalButtonsContainer}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>{t("cancel") || "Cancel"}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleSaveCategory}
              >
                <Text style={styles.primaryButtonText}>
                  {editingCategory ? t("save") || "Save" : t("create") || "Create"}
                </Text>
              </TouchableOpacity>
            </View>
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
  categoryItemContainer: {
    backgroundColor: "#FFFFFF",
  },
  categoryItem: {
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
  categoryItemHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  categoryIcon: {
    marginRight: 12,
  },
  categoryNameAr: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1A1A1A",
    flex: 1,
  },
  categoryTranslations: {
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
  optionalLabel: {
    color: "#999",
    fontWeight: "400",
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
    color: "#0f5b63",
    fontSize: 16,
    fontWeight: "600",
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
  deleteButton: {
    marginTop: 10,
    backgroundColor: "#dc3545",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  deleteButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
  loadingIndicator: {
    marginTop: 20,
  },
  // Icon picker styles
  iconPickerContainer: {
    marginTop: 8,
    marginBottom: 8,
  },
  iconScrollView: {
    maxHeight: 80,
  },
  iconScrollContent: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    gap: 8,
  },
  iconOption: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#F5F5F5",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
    borderWidth: 2,
    borderColor: "transparent",
  },
  iconOptionSelected: {
    backgroundColor: "#E8F4F5",
    borderColor: "#0f5b63",
  },
  selectedIconContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    padding: 12,
    backgroundColor: "#E8F4F5",
    borderRadius: 8,
    gap: 8,
  },
  selectedIconText: {
    flex: 1,
    fontSize: 14,
    color: "#0f5b63",
    fontWeight: "500",
  },
});
