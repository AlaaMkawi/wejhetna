// src/screens/AdminPlaceFormScreen.tsx
import { Picker } from "@react-native-picker/picker";
import { appAlert } from "../../utils/appAlert";
import { useRoute, useNavigation, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { View, Text, TextInput, StyleSheet, ActivityIndicator, TouchableOpacity, ScrollView, Platform, StatusBar } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";

import {
  fetchCities,
  fetchCategories,
  createAdminPlace,
  City,
  Category,
  PlaceType,
} from "../../api/places";

type AdminPlaceFormRoute = RouteProp<RootStackParamList, "AdminPlaceForm">;

export default function AdminPlaceFormScreen() {
  const { t } = useTranslation();
  const route = useRoute<AdminPlaceFormRoute>();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const {
    pickedLat,
    pickedLon,
    pickedSource,
    pickedOsmId,
    detectedCityId,
    adminUserId,
    role,
  } = route.params;

  const [name, setName] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [nameHe, setNameHe] = useState("");

  const [placeType, setPlaceType] = useState<PlaceType>("PUBLIC_SERVICE");
  const [cityId, setCityId] = useState<number | undefined>(undefined);
  const [categoryId, setCategoryId] = useState<number | undefined>(undefined);

  const [description, setDescription] = useState("");
  const [phone, setPhone] = useState("");
  const [openingHours, setOpeningHours] = useState("");

  const [lat, setLat] = useState<number | undefined>(undefined);
  const [lon, setLon] = useState<number | undefined>(undefined);

  const [cities, setCities] = useState<City[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [phoneTouched, setPhoneTouched] = useState(false);
  const [phoneBlurred, setPhoneBlurred] = useState(false);

  useEffect(() => {
    if (pickedLat && pickedLon) {
      setLat(pickedLat);
      setLon(pickedLon);
    }
  }, [pickedLat, pickedLon]);

  // עדכון העיר כאשר detectedCityId משתנה
  useEffect(() => {
    if (detectedCityId && cities.length > 0) {
      const cityExists = cities.some(c => c.id === detectedCityId);
      if (cityExists) {
        setCityId(detectedCityId);
      }
    }
  }, [detectedCityId, cities]);

  useEffect(() => {
    let isActive = true;

    async function loadData() {
      try {
        setLoading(true);

        const [citiesRes, categoriesRes] = await Promise.all([
          fetchCities(),
          fetchCategories(),
        ]);

        if (!isActive) return;

        setCities(citiesRes);
        setCategories(categoriesRes);

        if (detectedCityId) {
          const cityExists = citiesRes.some(c => c.id === detectedCityId);
          if (cityExists) {
            setCityId(detectedCityId);
          } else if (citiesRes.length > 0) {
            setCityId(citiesRes[0].id);
          }
        } else if (citiesRes.length > 0) {
          setCityId(prev => prev ?? citiesRes[0].id);
        }
      } catch (err) {
        console.error(err);
        appAlert(
          t("error") || "שגיאה",
          t("error_loading_cities_categories") ||
            "שגיאה בטעינת ערים/קטגוריות מהשרת"
        );
      } finally {
        if (isActive) setLoading(false);
      }
    }

    loadData();

    return () => {
      isActive = false;
    };
  }, [detectedCityId, t]);


  function handlePhoneChange(value: string) {
    const digitsOnly = value.replace(/[^0-9]/g, "");
    setPhone(digitsOnly);
    if (!phoneTouched) setPhoneTouched(true);
  }

  function handlePhoneBlur() {
    setPhoneBlurred(true);
  }

  const hasPhone = phone.length > 0;
  const isPhoneLengthRuleOk = phone.length === 9 || phone.length === 10;
  const isPhoneValid = !hasPhone || isPhoneLengthRuleOk;

  const shouldShowPhoneRequirements =
    phoneTouched && (!phoneBlurred || !isPhoneValid);

  const isNameValid = name.trim().length > 0;
  const isNameArValid = nameAr.trim().length > 0;
  const isNameHeValid = nameHe.trim().length > 0;
  const isCityValid = !!cityId;
  const isLocationValid = lat !== undefined && lon !== undefined;
  const isCategoryValid =
    placeType !== "BUSINESS" || (placeType === "BUSINESS" && !!categoryId);

  const isFormValid =
    isNameValid &&
    isNameArValid &&
    isNameHeValid &&
    isCityValid &&
    isLocationValid &&
    isCategoryValid &&
    isPhoneValid;

  const canSubmit = isFormValid && !creating;

  async function handleSubmit() {
    if (!isNameValid) {
      appAlert(t("error") || "שגיאה", t("place_name_required") || "שם המקום חובה");
      return;
    }
    if (!isNameArValid) {
      appAlert(t("error") || "שגיאה", t("place_name_arabic_required") || "שם המקום בערבית חובה");
      return;
    }
    if (!isNameHeValid) {
      appAlert(t("error") || "שגיאה", t("place_name_hebrew_required") || "שם המקום בעברית חובה");
      return;
    }

    if (!isCityValid) {
      appAlert(t("error") || "שגיאה", t("city_selection_required") || "חובה לבחור עיר");
      return;
    }

    if (!isCategoryValid) {
      appAlert(t("error") || "שגיאה", t("category_required_for_business") || "לעסק חובה לבחור קטגוריה");
      return;
    }

    if (!isLocationValid) {
      appAlert(t("error") || "שגיאה", t("location_selection_required") || "חובה לבחור מיקום על המפה במסך הקודם");
      return;
    }

    if (!isPhoneValid) {
      appAlert(
        t("error") || "שגיאה",
        t("phone_length_validation") || "מספר הטלפון (אם הוזן) חייב להיות באורך 9 או 10 ספרות"
      );
      return;
    }

    const isFromGps =
      pickedSource === "GPS_NO_OSM" || pickedSource === "GPS_WITH_OSM";
    const locationSourceForBackend = isFromGps ? "GPS" : "MAP_PICK";

    try {
      setCreating(true);

      await createAdminPlace({
        name,
        name_ar: nameAr,
        name_he: nameHe,
        place_type: placeType,
        city_id: cityId!,
        category_id: categoryId ?? null,
        can_be_claimed: placeType === "BUSINESS",
        description: description || null,
        phone: hasPhone ? phone : null,
        opening_hours: openingHours || null,
        main_image_url: null,
        social_links: null,
        owner_user_id: null,
        created_by_admin_id: adminUserId,
        lat: lat!,
        lon: lon!,
        source: locationSourceForBackend,
        osm_id: pickedOsmId ?? null,
      });

      appAlert(
        t("success") || "הצלחה",
        t("place_created_successfully") || "המקום נוצר בהצלחה 🎉",
        [
          {
            text: t("ok") || "OK",
            onPress: () =>
              navigation.reset({
                index: 0,
                routes: [
                  {
                    name: "AdminTabs",
                    params: { adminUserId, role },
                  },
                ],
              }),
          },
        ]
      );

      setName("");
      setNameAr("");
      setNameHe("");
      setDescription("");
      setPhone("");
      setOpeningHours("");
      setLat(undefined);
      setLon(undefined);
      setPhoneTouched(false);
      setPhoneBlurred(false);
    } catch (err: any) {
      // ⬅️ שינינו כאן – בלי console.error כדי שלא יופיע Toast אדום למשתמש
      if (__DEV__) {
        console.log("Create place error (dev log):", err);
      }

      const reason =
        err?.message || (t("place_creation_failed_unknown") || "נכשלה יצירת המקום (שגיאה לא ידועה)");

      appAlert(
        t("error_saving_place") || "שגיאה בשמירת המקום",
        `${t("place_creation_failed") || "נכשלה יצירת המקום."}\n\n${t("possible_reason") || "סיבה אפשרית:"}\n${reason}\n\n${t("would_you_like_to_try_again") || "האם תרצי לנסות שוב?"}`,
        [
          {
            text: t("back_to_home") || "חזרה למסך הבית",
            style: "destructive",
            onPress: () =>
              navigation.reset({
                index: 0,
                routes: [
                  {
                    name: "AdminTabs",
                    params: { adminUserId, role },
                  },
                ],
              }),
          },
          {
            text: t("try_again") || "לנסות שוב",
            style: "cancel",
            // לא עושים כלום → נשארים בדף והנתונים לא נמחקים
          },
        ]
      );
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text>{t("loading_cities_categories") || "טוען ערים וקטגוריות..."}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-forward" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.title}>{t("add_new_place") || "הוספת מקום חדש"}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.formContainer}>
        <Text style={styles.label}>
          {t("name_english") || "שם באנגלית"} <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={(text) => setName(text.replace(/[^A-Za-z0-9 _-]/g, ""))}
          placeholder={t("example_place_name_en") || "Example: Mother and Child Clinic"}
          placeholderTextColor="#999"
        />
        
        <Text style={styles.label}>
          {t("name_arabic") || "שם בערבית"} <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          style={styles.input}
          value={nameAr}
          onChangeText={(text) => setNameAr(text.replace(/[^\u0600-\u06FF\s]/g, ""))}
          placeholder={t("example_place_name_ar") || "مثال: عيادة الأم والطفل"}
          placeholderTextColor="#999"
          textAlign="right"
        />

        <Text style={styles.label}>
          {t("name_hebrew") || "שם בעברית"} <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          style={styles.input}
          value={nameHe}
          onChangeText={(text) => setNameHe(text.replace(/[^\u0590-\u05FF\s]/g, ""))}
          placeholder={t("example_place_name_he") || "לדוגמה: מרפאת אם וילד"}
          placeholderTextColor="#999"
          textAlign="right"
        />

        <Text style={styles.label}>{t("place_type") || "סוג המקום"}</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={placeType}
            onValueChange={(val) => setPlaceType(val as PlaceType)}
            style={styles.picker}
          >
            <Picker.Item label={t("public_service") || "שירות ציבורי"} value="PUBLIC_SERVICE" />
            <Picker.Item label={t("business") || "עסק"} value="BUSINESS" />
          </Picker>
        </View>

        <Text style={styles.label}>
          {t("city") || "עיר"} <Text style={styles.required}>*</Text>
        </Text>
        {detectedCityId && cityId ? (
          <View style={styles.cityDisplayContainer}>
            <Ionicons name="location" size={20} color="#0f5b63" />
            <Text style={styles.cityDisplayText}>
              {(() => {
                const city = cities.find(c => c.id === cityId);
                if (city) {
                  return `${city.name_ar}${city.name_he ? ` (${city.name_he})` : ""}`;
                }
                return t("city_not_identified") || "עיר לא מזוהה";
              })()}
            </Text>
            <Text style={styles.cityAutoDetectedLabel}>({t("auto_detected") || "זוהה אוטומטית"})</Text>
          </View>
        ) : (
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={cityId}
              onValueChange={(val) => setCityId(val as number)}
              style={styles.picker}
            >
              {cities.map((c) => (
                <Picker.Item
                  key={c.id}
                  label={`${String(c.name_ar)} ${
                    c.name_he ? `(${String(c.name_he)})` : ""
                  }`}
                  value={c.id}
                />
              ))}
            </Picker>
          </View>
        )}

        {placeType === "BUSINESS" && (
          <>
            <Text style={styles.label}>
              {t("category_for_business") || "קטגוריה (לעסק)"} <Text style={styles.required}>*</Text>
            </Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={categoryId}
                onValueChange={(val) => setCategoryId(val as number)}
                style={styles.picker}
              >
                <Picker.Item label={t("select_category") || "בחרי קטגוריה..."} value={undefined as any} />
                {categories.map((cat) => (
                  <Picker.Item
                    key={cat.id}
                    label={`${String(cat.name_ar)} ${
                      cat.name_he ? `(${String(cat.name_he)})` : ""
                    }`}
                    value={cat.id}
                  />
                ))}
              </Picker>
            </View>
          </>
        )}

        <Text style={styles.label}>{t("description") || "תיאור"}</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          placeholder={t("place_description_placeholder") || "תיאור המקום..."}
          placeholderTextColor="#999"
        />

        <Text style={styles.label}>{t("phone") || "טלפון"}</Text>
        <TextInput
          style={[
            styles.input,
            phoneTouched && !isPhoneValid && styles.inputError,
          ]}
          value={phone}
          onChangeText={handlePhoneChange}
          onBlur={handlePhoneBlur}
          keyboardType="phone-pad"
          placeholder={t("phone_example") || "למשל: 0541234567"}
          placeholderTextColor="#999"
        />

        {shouldShowPhoneRequirements && (
          <View style={styles.reqBox}>
            <View style={styles.reqRow}>
              <Text
                style={[
                  styles.reqIcon,
                  { color: hasPhone ? "green" : "red" },
                ]}
              >
                {hasPhone ? "✅" : "❌"}
              </Text>
              <Text
                style={[
                  styles.reqText,
                  { color: hasPhone ? "green" : "red" },
                ]}
              >
                {t("phone_digits_only") || "מכיל רק ספרות (0–9)"}
              </Text>
            </View>

            <View style={styles.reqRow}>
              <Text
                style={[
                  styles.reqIcon,
                  { color: isPhoneLengthRuleOk ? "green" : "red" },
                ]}
              >
                {isPhoneLengthRuleOk ? "✅" : "❌"}
              </Text>
              <Text
                style={[
                  styles.reqText,
                  { color: isPhoneLengthRuleOk ? "green" : "red" },
                ]}
              >
                {t("phone_length_9_10") || "אורך 9 או 10 ספרות"}
              </Text>
            </View>
          </View>
        )}

        <View style={styles.locationRow}>
          <Text style={styles.label}>
            {t("location_on_map") || "מיקום על המפה"} <Text style={styles.required}>*</Text>
          </Text>
          {lat !== undefined && lon !== undefined ? (
            <View style={styles.locationInfoBox}>
              <Ionicons name="location" size={20} color="#0f5b63" />
              <Text style={styles.locationText}>
                lat: {lat.toFixed(5)}, lon: {lon.toFixed(5)}
              </Text>
            </View>
          ) : (
            <View style={styles.locationErrorBox}>
              <Ionicons name="alert-circle" size={20} color="#dc3545" />
              <Text style={styles.locationErrorText}>
                {t("must_select_location_on_map") || "חובה לבחור מיקום במסך המפה"}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.buttonContainer}>
          {creating && (
            <View style={styles.savingRow}>
              <ActivityIndicator color="#0f5b63" />
              <Text style={styles.savingText}>{t("saving_place") || "שומר מקום..."}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[
              styles.saveButton,
              !canSubmit && styles.saveButtonDisabled,
            ]}
            activeOpacity={canSubmit ? 0.7 : 1}
            onPress={canSubmit ? handleSubmit : undefined}
            disabled={!canSubmit}
          >
            <Text style={[
              styles.saveButtonText,
              !canSubmit && styles.saveButtonTextDisabled,
            ]}>
              {t("save_place") || "שמור מקום"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      </ScrollView>
    </View>
  );
}

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
    paddingTop: Platform.OS === 'ios' ? 50 : 16,
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
    paddingBottom: 32,
  },
  formContainer: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
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
    marginBottom: 4,
  },
  inputError: {
    borderBottomColor: "#dc3545",
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  pickerContainer: {
    borderWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: "#8593adff",
    marginBottom: 4,
  },
  picker: {
    height: Platform.OS === 'ios' ? 200 : 50,
  },
  cityDisplayContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#E8F4F5",
    borderRadius: 8,
    marginBottom: 4,
    gap: 8,
  },
  cityDisplayText: {
    flex: 1,
    color: "#0f5b63",
    fontSize: 16,
    fontWeight: "600",
  },
  cityAutoDetectedLabel: {
    color: "#6B7280",
    fontSize: 12,
    fontStyle: "italic",
  },
  locationRow: {
    marginTop: 16,
    marginBottom: 8,
  },
  locationInfoBox: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#E8F4F5",
    borderRadius: 8,
    marginTop: 8,
    gap: 8,
  },
  locationText: {
    color: "#0f5b63",
    fontSize: 14,
    fontWeight: "500",
  },
  locationErrorBox: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#FFF5F5",
    borderRadius: 8,
    marginTop: 8,
    gap: 8,
  },
  locationErrorText: {
    color: "#dc3545",
    fontSize: 14,
    fontWeight: "500",
  },
  reqBox: {
    marginTop: 4,
    marginBottom: 4,
  },
  reqRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  reqIcon: {
    marginRight: 6,
    fontSize: 14,
  },
  reqText: {
    fontSize: 13,
  },
  buttonContainer: {
    marginTop: 24,
    marginBottom: 16,
  },
  savingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    gap: 8,
  },
  savingText: {
    color: "#0f5b63",
    fontSize: 14,
    fontWeight: "500",
  },
  saveButton: {
    backgroundColor: "#d7e9eaff",
    borderRadius: 30,
    paddingVertical: 16,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#255156ff",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  saveButtonDisabled: {
    backgroundColor: "#E5E7EB",
    borderColor: "#9CA3AF",
  },
  saveButtonText: {
    color: "#0f5b63",
    fontSize: 18,
    fontWeight: "700",
  },
  saveButtonTextDisabled: {
    color: "#9CA3AF",
  },
});
