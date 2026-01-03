// src/screens/EditPlaceScreen.tsx

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  ScrollView,
  Image,
  Platform,
  StatusBar,
} from "react-native";
import { useTranslation } from "react-i18next";
import { launchImageLibrary } from "react-native-image-picker";
import { useRoute, useNavigation, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Picker } from "@react-native-picker/picker";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RootStackParamList } from "../navigation/types";
import {
  fetchCities,
  fetchCategories,
  City,
  Category,
  PlaceForMap,
  fetchAllPlaces,
} from "../api/places";

const DARK_TEAL = "#0f5b63";
const SOFT_TEAL = "#3a8d96";
const MINT = "#9bd3d8";
import { API_BASE_URL } from "../../config";

type EditPlaceRoute = RouteProp<RootStackParamList, "EditPlace">;

export default function EditPlaceScreen() {
  const { t } = useTranslation();
  const route = useRoute<EditPlaceRoute>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();

  const { placeId, userRole, userId } = route.params;

  const [place, setPlace] = useState<PlaceForMap | null>(null);
  const [name, setName] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [nameHe, setNameHe] = useState("");

  const [cityId, setCityId] = useState<number | undefined>(undefined);
  const [categoryId, setCategoryId] = useState<number | undefined>(undefined);

  const [description, setDescription] = useState("");
  const [phone, setPhone] = useState("");
  const [openingHours, setOpeningHours] = useState("");
  const [socialLinks, setSocialLinks] = useState("");

  const [mainImageUrl, setMainImageUrl] = useState<string>("");
  const [uploadingImage, setUploadingImage] = useState(false);

  const [cities, setCities] = useState<City[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const [nameError, setNameError] = useState<string | null>(null);
  const [nameArError, setNameArError] = useState<string | null>(null);
  const [nameHeError, setNameHeError] = useState<string | null>(null);
  const [, setCityError] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  // Load place data
  useEffect(() => {
    async function loadPlaceData() {
      try {
        setLoading(true);
        const places = await fetchAllPlaces();
        const foundPlace = places.find(p => p.id === placeId);
        
        if (!foundPlace) {
          Alert.alert(
            t("error") || "שגיאה",
            t("place_not_found") || "המקום לא נמצא"
          );
          navigation.goBack();
          return;
        }

        // Check if business owner can edit this place
        if (userRole === "BUSINESS_OWNER" && foundPlace.owner_user_id !== userId) {
          Alert.alert(
            t("error") || "שגיאה",
            t("cannot_edit_place") || "אין לך הרשאה לערוך מקום זה"
          );
          navigation.goBack();
          return;
        }

        setPlace(foundPlace);
        setName(foundPlace.name || "");
        setNameAr(foundPlace.name_ar || "");
        setNameHe(foundPlace.name_he || "");
        setCityId(foundPlace.city?.id);
        setCategoryId(foundPlace.category?.id);
        setDescription(foundPlace.description || "");
        setPhone(foundPlace.phone || "");
        setOpeningHours(foundPlace.opening_hours || "");
        setSocialLinks(foundPlace.social_links || "");
        setMainImageUrl(foundPlace.main_image_url || "");
      } catch (error: any) {
        Alert.alert(
          t("error") || "שגיאה",
          error.message || t("failed_to_load_place") || "נכשל בטעינת המקום"
        );
        navigation.goBack();
      } finally {
        setLoading(false);
      }
    }

    loadPlaceData();
  }, [placeId, userRole, userId, navigation, t]);

  // Load cities and categories
  useEffect(() => {
    async function loadData() {
      try {
        const [citiesRes, categoriesRes] = await Promise.all([
          fetchCities(),
          fetchCategories(),
        ]);

        setCities(citiesRes);
        setCategories(categoriesRes);
      } catch (err) {
        console.error(err);
        Alert.alert(
          t("error") || "שגיאה",
          t("failed_to_load_data") || "נכשל בטעינת הנתונים"
        );
      }
    }

    loadData();
  }, [t]);

  function handleNameChange(value: string) {
    setName(value);
    setNameError(value.trim() ? null : (t("name_required") || "שם חובה"));
  }

  function handleNameArChange(value: string) {
    setNameAr(value);
    setNameArError(value.trim() ? null : (t("arabic_name_required") || "שם בערבית חובה"));
  }

  function handleNameHeChange(value: string) {
    setNameHe(value);
    setNameHeError(value.trim() ? null : (t("hebrew_name_required") || "שם בעברית חובה"));
  }

  function handleCityChange(value: number | undefined) {
    setCityId(value);
    setCityError(value ? null : (t("please_select_city") || "אנא בחר עיר"));
  }

  function handleCategoryChange(value: number | undefined) {
    setCategoryId(value);
    setCategoryError(value ? null : (t("please_select_category") || "אנא בחר קטגוריה"));
  }

  function handlePhoneChange(value: string) {
    // Allow only digits
    const cleaned = value.replace(/[^\d]/g, "");
    setPhone(cleaned);
    
    if (cleaned.length > 0 && cleaned.length !== 9 && cleaned.length !== 10) {
      setPhoneError(t("phone_length_validation") || "מספר הטלפון חייב להיות 9 או 10 ספרות");
    } else {
      setPhoneError(null);
    }
  }

  async function handleUploadImage() {
    launchImageLibrary(
      {
        mediaType: "photo",
        quality: 0.8,
        selectionLimit: 1,
      },
      async (res) => {
        if (res.didCancel || res.errorCode) {
          return;
        }

        const asset = res.assets?.[0];
        if (!asset || !asset.uri) return;

        setUploadingImage(true);
        try {
          const formData = new FormData();
          formData.append("file", {
            uri: asset.uri,
            name: asset.fileName || "upload.jpg",
            type: asset.type || "image/jpeg",
          } as any);

          const uploadRes = await fetch(`${API_BASE_URL}/files/upload`, {
            method: "POST",
            headers: { "Content-Type": "multipart/form-data" },
            body: formData,
          });
          const json = await uploadRes.json();
          if (json.file_url) {
            setMainImageUrl(json.file_url);
          } else {
            Alert.alert(t("error") || "שגיאה", t("failed_to_upload_image") || "נכשל בהעלאת התמונה");
          }
        } catch (e: any) {
          console.log("Upload error", e?.message || e);
          Alert.alert(t("error") || "שגיאה", t("failed_to_upload_image") || "נכשל בהעלאת התמונה");
        } finally {
          setUploadingImage(false);
        }
      }
    );
  }

  async function handleSubmit() {
    // Validation
    if (!name.trim()) {
      setNameError(t("name_required") || "שם חובה");
      return;
    }
    if (!nameAr.trim()) {
      setNameArError(t("arabic_name_required") || "שם בערבית חובה");
      return;
    }
    if (!nameHe.trim()) {
      setNameHeError(t("hebrew_name_required") || "שם בעברית חובה");
      return;
    }
    // City is not editable, so we don't validate it
    if (place?.place_type === "BUSINESS" && !categoryId) {
      setCategoryError(t("please_select_category") || "אנא בחר קטגוריה");
      return;
    }

    const hasPhone = phone.length > 0;
    const isPhoneLengthRuleOk = phone.length === 9 || phone.length === 10;
    if (hasPhone && !isPhoneLengthRuleOk) {
      setPhoneError(t("phone_length_validation") || "מספר הטלפון חייב להיות 9 או 10 ספרות");
      return;
    }

    try {
      setUpdating(true);

      const updateData: any = {
        name: name.trim(),
        name_ar: nameAr.trim(),
        name_he: nameHe.trim(),
        // city_id is not included - city cannot be edited
        category_id: categoryId || null,
        description: description.trim() ? description.trim() : null,
        phone: hasPhone && phone.trim() ? phone.trim() : null,
        opening_hours: openingHours.trim() ? openingHours.trim() : null,
        main_image_url: mainImageUrl && mainImageUrl.trim() ? mainImageUrl.trim() : null,
        social_links: socialLinks.trim() ? socialLinks.trim() : null,
      };

      console.log("Sending update data:", updateData);

      const response = await fetch(`${API_BASE_URL}/admin/places/${placeId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateData),
      });

      const responseData = await response.json().catch(() => ({}));
      
      if (!response.ok) {
        console.error("Update failed:", response.status, responseData);
        throw new Error(responseData.detail || t("failed_to_update_place") || "נכשל בעדכון המקום");
      }

      console.log("Update successful:", responseData);

      // Navigate back to home screen immediately after successful update
      if (userRole === "ADMIN") {
        navigation.reset({
          index: 0,
          routes: [
            {
              name: "AdminTabs",
              params: { adminUserId: userId!, role: "ADMIN", selectedPlaceId: placeId },
            },
          ],
        });
      } else {
        // Business owner
        navigation.reset({
          index: 0,
          routes: [
            {
              name: "UserTabs",
              params: { selectedPlaceId: placeId },
            },
          ],
        });
      }

      // Show success alert after navigation
      setTimeout(() => {
        Alert.alert(
          t("success") || "הצלחה",
          t("place_updated_successfully") || "המקום עודכן בהצלחה"
        );
      }, 300);
    } catch (error: any) {
      Alert.alert(
        t("error") || "שגיאה",
        error.message || t("failed_to_update_place") || "נכשל בעדכון המקום"
      );
    } finally {
      setUpdating(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={DARK_TEAL} />
        <Text style={styles.loadingText}>{t("loading") || "טוען..."}</Text>
      </View>
    );
  }

  if (!place) {
    return null;
  }

  return (
    <View style={styles.wrapper}>
      <StatusBar barStyle="dark-content" />
      
      {/* Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, Platform.OS === 'ios' ? 50 : 16) + 8 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            if (navigation.canGoBack()) {
              navigation.goBack();
            }
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-forward" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.title}>{t("edit_place_details") || "ערוך פרטי מקום"}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.container}>
          {/* Business Names Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("business_name") || "Business Name"} *</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t("english") || "English"}</Text>
              <TextInput
                style={[styles.input, styles.inputLTR, nameError && styles.inputError]}
                value={name}
                onChangeText={handleNameChange}
                placeholder={t("example_coffee_shop") || "Example: Coffee Shop"}
                placeholderTextColor="#9ab8bd"
                textAlign="left"
              />
              {nameError && <Text style={styles.fieldError}>{nameError}</Text>}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t("arabic") || "Arabic"}</Text>
              <TextInput
                style={[styles.input, styles.inputRTL, nameArError && styles.inputError]}
                value={nameAr}
                onChangeText={handleNameArChange}
                placeholder={t("example_cafe_ar") || "مثال: مقهى"}
                textAlign="right"
                placeholderTextColor="#9ab8bd"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {nameArError && <Text style={[styles.fieldError, styles.fieldErrorRTL]}>{nameArError}</Text>}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t("hebrew") || "Hebrew"}</Text>
              <TextInput
                style={[styles.input, styles.inputRTL, nameHeError && styles.inputError]}
                value={nameHe}
                onChangeText={handleNameHeChange}
                placeholder={t("example_cafe_he") || "דוגמה: בית קפה"}
                textAlign="right"
                placeholderTextColor="#9ab8bd"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {nameHeError && <Text style={[styles.fieldError, styles.fieldErrorRTL]}>{nameHeError}</Text>}
            </View>
          </View>

          {/* City and Category Section */}
          <View style={styles.section}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t("city") || "City"} *</Text>
              <View style={[styles.pickerContainer, styles.pickerDisabled]}>
                <Picker
                  selectedValue={cityId}
                  onValueChange={handleCityChange}
                  style={styles.picker}
                  enabled={false}
                >
                  <Picker.Item label={t("select_city") || "Select a city..."} value={undefined} />
                  {cities.map((city) => (
                    <Picker.Item
                      key={city.id}
                      label={city.name_ar || city.name_en || `City ${city.id}`}
                      value={city.id}
                    />
                  ))}
                </Picker>
              </View>
              <Text style={styles.infoText}>
                {t("city_cannot_be_edited") || "העיר לא ניתנת לעריכה"}
              </Text>
            </View>

            {place.place_type === "BUSINESS" && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{t("category") || "Category"} *</Text>
                <View style={[styles.pickerContainer, categoryError && styles.inputError]}>
                  <Picker
                    selectedValue={categoryId}
                    onValueChange={handleCategoryChange}
                    style={styles.picker}
                  >
                    <Picker.Item label={t("select_category") || "Select a category..."} value={undefined} />
                    {categories.map((cat) => (
                      <Picker.Item
                        key={cat.id}
                        label={cat.name_ar || cat.name_en || `Category ${cat.id}`}
                        value={cat.id}
                      />
                    ))}
                  </Picker>
                </View>
                {categoryError && <Text style={styles.fieldError}>{categoryError}</Text>}
              </View>
            )}
          </View>

          {/* Contact Information Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("contact_information") || "Contact Information"}</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t("phone") || "Phone"} ({t("optional") || "Optional"})</Text>
              <TextInput
                style={[styles.input, phoneError && styles.inputError]}
                value={phone}
                onChangeText={handlePhoneChange}
                placeholder="0501234567"
                keyboardType="phone-pad"
                maxLength={10}
                placeholderTextColor="#9ab8bd"
              />
              {phoneError && <Text style={styles.fieldError}>{phoneError}</Text>}
            </View>
          </View>

          {/* Additional Information Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("additional_information") || "Additional Information"}</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t("description") || "Description"} ({t("optional") || "Optional"})</Text>
              <TextInput
                style={[styles.input, styles.textArea, styles.inputRTL]}
                value={description}
                onChangeText={setDescription}
                placeholder={t("describe_business") || "Describe your business..."}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                textAlign="right"
                placeholderTextColor="#9ab8bd"
                autoCorrect={false}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t("opening_hours") || "Opening Hours"} ({t("optional") || "Optional"})</Text>
              <TextInput
                style={styles.input}
                value={openingHours}
                onChangeText={setOpeningHours}
                placeholder={t("example_opening_hours") || "Example: Sun-Thu: 9:00-18:00"}
                placeholderTextColor="#9ab8bd"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t("social_links") || "Social Links"} ({t("optional") || "Optional"})</Text>
              <TextInput
                style={styles.input}
                value={socialLinks}
                onChangeText={setSocialLinks}
                placeholder={t("example_social_links") || "Example: https://facebook.com/..."}
                placeholderTextColor="#9ab8bd"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          {/* Image Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("main_image") || "Main Image"} ({t("optional") || "Optional"})</Text>
            
            <View style={styles.inputGroup}>
              <TouchableOpacity
                style={styles.uploadButton}
                onPress={handleUploadImage}
                disabled={uploadingImage}
              >
                {uploadingImage ? (
                  <ActivityIndicator color={DARK_TEAL} />
                ) : mainImageUrl ? (
                  <View style={styles.imagePreviewContainer}>
                    <Image 
                      source={{ uri: mainImageUrl }} 
                      style={styles.imagePreview}
                      resizeMode="cover"
                    />
                    <Text style={styles.imagePreviewText}>{t("uploaded") || "Uploaded"} ✓</Text>
                  </View>
                ) : (
                  <View style={styles.uploadButtonContent}>
                    <Ionicons name="camera-outline" size={24} color={DARK_TEAL} />
                    <Text style={styles.uploadButtonText}>{t("upload_image") || "Upload Image"}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.submitButton, updating && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={updating}
          >
            {updating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>
                {t("save_changes") || "שמור שינויים"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: "#f5fdff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  backButton: {
    padding: 4,
    marginRight: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    flex: 1,
    textAlign: "center",
    marginTop: 6,
    color: "#1A1A1A",
  },
  headerSpacer: {
    width: 40,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 24,
  },
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f5fdff",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: DARK_TEAL,
  },
  section: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#d6ebee",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: DARK_TEAL,
    marginBottom: 16,
    textAlign: "right",
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: DARK_TEAL,
    marginBottom: 8,
    textAlign: "right",
  },
  input: {
    backgroundColor: "#f5fdff",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#d6ebee",
    fontSize: 15,
    color: DARK_TEAL,
  },
  inputLTR: {
    textAlign: "left",
    writingDirection: "ltr",
  },
  inputRTL: {
    textAlign: "right",
    writingDirection: "rtl",
  },
  inputError: {
    borderColor: "#d7263d",
    borderWidth: 1.5,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  fieldError: {
    color: "#d7263d",
    fontSize: 12,
    marginTop: 6,
    textAlign: "right",
  },
  fieldErrorRTL: {
    textAlign: "right",
    writingDirection: "rtl",
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: "#d6ebee",
    borderRadius: 12,
    backgroundColor: "#f5fdff",
    overflow: "hidden",
  },
  pickerDisabled: {
    backgroundColor: "#e8f4f6",
    opacity: 0.7,
  },
  picker: {
    height: 50,
    color: DARK_TEAL,
  },
  infoText: {
    color: SOFT_TEAL,
    fontSize: 12,
    marginTop: 6,
    textAlign: "right",
    fontStyle: "italic",
  },
  submitButton: {
    backgroundColor: DARK_TEAL,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    marginBottom: 24,
    shadowColor: DARK_TEAL,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  submitButtonDisabled: {
    backgroundColor: "#9ab8bd",
    opacity: 0.6,
  },
  submitButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  uploadButton: {
    borderWidth: 2,
    borderColor: MINT,
    borderStyle: "dashed",
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f5fdff",
    minHeight: 80,
  },
  uploadButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  uploadButtonText: {
    color: DARK_TEAL,
    fontWeight: "600",
    fontSize: 14,
  },
  imagePreviewContainer: {
    alignItems: "center",
    width: "100%",
  },
  imagePreview: {
    width: 200,
    height: 150,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: "#f0f0f0",
  },
  imagePreviewText: {
    color: "#4CAF50",
    fontWeight: "600",
    fontSize: 12,
  },
});

