// src/screens/AdminPlaceFormScreen.tsx
import { Picker } from "@react-native-picker/picker";
import { useRoute } from "@react-navigation/native";
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
} from "react-native";

import {
  fetchCities,
  fetchCategories,
  createAdminPlace,
  City,
  Category,
  PlaceType,
} from "../../api/places";

type AdminPlaceFormRouteParams = {
  pickedLat?: number;
  pickedLon?: number;
};

export default function AdminPlaceFormScreen() {
  const route = useRoute();
  const params = route.params as AdminPlaceFormRouteParams | undefined;

  const [name, setName] = useState("");
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
    if (params?.pickedLat && params?.pickedLon) {
      setLat(params.pickedLat);
      setLon(params.pickedLon);
    }
  }, [params?.pickedLat, params?.pickedLon]);

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

        if (citiesRes.length > 0) {
          setCityId((prev) => prev ?? citiesRes[0].id);
        }
      } catch (err) {
        console.error(err);
        Alert.alert("שגיאה", "שגיאה בטעינת ערים/קטגוריות מהשרת");
      } finally {
        if (isActive) setLoading(false);
      }
    }

    loadData();
    return () => {
      isActive = false;
    };
  }, []);

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
  const isCityValid = !!cityId;
  const isLocationValid = lat !== undefined && lon !== undefined;
  const isCategoryValid =
    placeType !== "BUSINESS" || (placeType === "BUSINESS" && !!categoryId);

  const isFormValid =
    isNameValid && isCityValid && isLocationValid && isCategoryValid && isPhoneValid;

  const canSubmit = isFormValid && !creating;

  async function handleSubmit() {
    if (!isNameValid) {
      Alert.alert("שגיאה", "שם המקום חובה");
      return;
    }

    if (!isCityValid) {
      Alert.alert("שגיאה", "חובה לבחור עיר");
      return;
    }

    if (!isCategoryValid) {
      Alert.alert("שגיאה", "לעסק חובה לבחור קטגוריה");
      return;
    }

    if (!isLocationValid) {
      Alert.alert("שגיאה", "חובה לבחור מיקום על המפה במסך הקודם");
      return;
    }

    if (!isPhoneValid) {
      Alert.alert("שגיאה", "מספר הטלפון (אם הוזן) חייב להיות באורך 9 או 10 ספרות");
      return;
    }

    try {
      setCreating(true);

      await createAdminPlace({
        name,
        place_type: placeType,
        city_id: cityId!,
        category_id: categoryId ?? null,
        can_be_claimed: true,
        description: description || null,
        phone: hasPhone ? phone : null,
        opening_hours: openingHours || null,
        main_image_url: null,
        social_links: null,
        owner_user_id: null,
        lat: lat!,
        lon: lon!,
        source: "MAP_PICK",
        osm_id: null,
      });

      Alert.alert("הצלחה", "המקום נוצר בהצלחה 🎉");
      setName("");
      setDescription("");
      setPhone("");
      setOpeningHours("");
      setLat(undefined);
      setLon(undefined);
      setPhoneTouched(false);
      setPhoneBlurred(false);
    } catch (err) {
      console.error(err);
      Alert.alert("שגיאה", "נכשלה יצירת המקום, בדקי לוגים ב־backend");
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={styles.primaryColor.color} size="large" />
        <Text style={styles.loadingText}>טוען ערים וקטגוריות...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer}>
      <View style={styles.container}>
        <Text style={styles.label}>שם המקום *</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="למשל: מרפאת אם וילד"
          placeholderTextColor={styles.placeholder.color}
        />

        <Text style={styles.label}>סוג המקום</Text>
        {/* ה-Picker מוגבל בעיצובו, אך נעטוף אותו ב-View עם סטייל מודרני ככל האפשר */}
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={placeType}
            onValueChange={(val) => setPlaceType(val as PlaceType)}
            style={styles.picker}
            dropdownIconColor={styles.primaryColor.color}
          >
            <Picker.Item label="שירות ציבורי" value="PUBLIC_SERVICE" />
            <Picker.Item label="עסק" value="BUSINESS" />
          </Picker>
        </View>

        <Text style={styles.label}>עיר *</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={cityId}
            onValueChange={(val) => setCityId(val as number)}
            style={styles.picker}
            dropdownIconColor={styles.primaryColor.color}
          >
            {cities.map((c) => (
              <Picker.Item
                key={c.id}
                label={`${c.name_ar} ${c.name_he ? `(${c.name_he})` : ""}`}
                value={c.id}
              />
            ))}
          </Picker>
        </View>

        {placeType === "BUSINESS" && (
          <>
            <Text style={styles.label}>קטגוריה (לעסק) *</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={categoryId}
                onValueChange={(val) => setCategoryId(val as number)}
                style={styles.picker}
                dropdownIconColor={styles.primaryColor.color}
              >
                <Picker.Item label="בחרי קטגוריה..." value={undefined as any} />
                {categories.map((cat) => (
                  <Picker.Item
                    key={cat.id}
                    label={`${cat.name_ar} ${cat.name_he ? `(${cat.name_he})` : ""}`}
                    value={cat.id}
                  />
                ))}
              </Picker>
            </View>
          </>
        )}

        <Text style={styles.label}>תיאור</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={description}
          onChangeText={setDescription}
          multiline
          placeholderTextColor={styles.placeholder.color}
        />

        <Text style={styles.label}>טלפון</Text>
        <TextInput
          style={[
            styles.input,
            phoneTouched && !isPhoneValid && styles.inputError,
          ]}
          value={phone}
          onChangeText={handlePhoneChange}
          onBlur={handlePhoneBlur}
          keyboardType="phone-pad"
          placeholder="למשל: 0541234567"
          placeholderTextColor={styles.placeholder.color}
        />

        {shouldShowPhoneRequirements && (
          <View style={styles.reqBox}>
            <View style={styles.reqRow}>
              <Text
                style={[
                  styles.reqIcon,
                  { color: hasPhone ? styles.successColor.color : styles.errorColor.color },
                ]}
              >
                {hasPhone ? "✅" : "❌"}
              </Text>
              <Text
                style={[
                  styles.reqText,
                  { color: hasPhone ? styles.successColor.color : styles.errorColor.color },
                ]}
              >
                מכיל רק ספרות (0–9)
              </Text>
            </View>

            <View style={styles.reqRow}>
              <Text
                style={[
                  styles.reqIcon,
                  { color: isPhoneLengthRuleOk ? styles.successColor.color : styles.errorColor.color },
                ]}
              >
                {isPhoneLengthRuleOk ? "✅" : "❌"}
              </Text>
              <Text
                style={[
                  styles.reqText,
                  { color: isPhoneLengthRuleOk ? styles.successColor.color : styles.errorColor.color },
                ]}
              >
                אורך 9 או 10 ספרות
              </Text>
            </View>
          </View>
        )}

        <Text style={styles.label}>שעות פתיחה</Text>
        <TextInput
          style={styles.input}
          value={openingHours}
          onChangeText={setOpeningHours}
          placeholder="למשל: 08:00–16:00"
          placeholderTextColor={styles.placeholder.color}
        />

        <View style={styles.locationRow}>
          <View>
            <Text style={styles.label}>מיקום על המפה *</Text>
            {lat !== undefined && lon !== undefined ? (
              <Text style={styles.locationTextValid}>
                ✅ נבחר מיקום: lat: {lat.toFixed(5)}, lon: {lon.toFixed(5)}
              </Text>
            ) : (
              <Text style={styles.locationTextInvalid}>
                ❌ חובה לבחור מיקום במסך המפה (Admin Map)
              </Text>
            )}
          </View>
        </View>

        <View style={styles.buttonSection}>
          {creating && (
            <View style={styles.savingRow}>
              <ActivityIndicator color={styles.primaryColor.color} />
              <Text style={styles.savingText}>שומר מקום...</Text>
            </View>
          )}

          <TouchableOpacity
            style={[
              styles.saveButton,
              { backgroundColor: canSubmit ? styles.primaryColor.color : styles.disabledColor.color },
            ]}
            activeOpacity={canSubmit ? 0.7 : 1}
            onPress={canSubmit ? handleSubmit : undefined}
            disabled={!canSubmit}
          >
            <Text style={styles.saveButtonText}>שמור מקום</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // --- צבעים וקבועים גלובליים ---
  primaryColor: { color: "#4DD0E1" }, // תכלת נעים
  secondaryColor: { color: "#00BCD4" }, // תכלת עמוק יותר
  borderColor: { color: "#E0E0E0" }, // אפור בהיר לגבולות
  placeholder: { color: "#9E9E9E" }, // אפור ל-Placeholder
  successColor: { color: "#66BB6A" }, // ירוק הצלחה
  errorColor: { color: "#EF5350" }, // אדום שגיאה
  disabledColor: { color: "#BDBDBD" }, // אפור לכפתור לא פעיל
  
  // --- סטיילים כלליים ---
  container: { flex: 1 },
  scrollContainer: { padding: 20 }, // הגדלנו ריווח חיצוני
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { marginTop: 8, color: '#616161' },

  // --- סטייל לתוויות ושדות ---
  label: {
    fontWeight: "700", // יותר מודגש
    marginTop: 16, // ריווח יותר גדול מלמעלה
    marginBottom: 8,
    fontSize: 15,
    color: '#424242', // צבע טקסט כהה
  },
  input: {
    borderWidth: 1,
    borderColor: "#E0E0E0", // גבול בהיר
    borderRadius: 12, // פינות מעוגלות יותר (סמודי)
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: "#FFFFFF", // רקע לבן לשדה
  },
  textArea: {
    height: 100, // הגדלנו קצת
    textAlignVertical: 'top', // חשוב ל-multiline
  },
  inputError: {
    borderColor: "#EF5350", // גבול אדום לשגיאה
    backgroundColor: "#FFEBEE", // רקע אדום בהיר לשגיאה
  },

  // --- סטייל ל-Picker ---
  pickerContainer: {
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 12,
    overflow: 'hidden', // חותך את ה-Picker לגבולות המעוגלים
    backgroundColor: "#FFFFFF",
    marginBottom: 4,
  },
  picker: {
    // ב-iOS ניתן לעצב את ה-Picker. ב-Android, העיצוב מוגבל ללא ספרייה חיצונית.
    // הקונטיינר מסביב (pickerContainer) נותן את העיגול.
  },
  
  // --- סטייל למיקום (Location) ---
  locationRow: {
    marginTop: 20,
    padding: 10,
    backgroundColor: '#F5F5F5', // רקע אפור בהיר
    borderRadius: 12,
  },
  locationTextValid: {
    color: "#4DD0E1", // תכלת כאינדיקציה חיובית
    fontWeight: '600',
    marginTop: 4,
  },
  locationTextInvalid: {
    color: "#EF5350", // אדום לשגיאה
    fontWeight: '600',
    marginTop: 4,
  },
  
  // --- סטייל לדרישות טלפון ---
  reqBox: {
    marginTop: 4,
    marginBottom: 8,
    paddingHorizontal: 5,
  },
  reqRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  reqIcon: {
    marginRight: 6,
    fontSize: 16,
    fontWeight: 'bold',
  },
  reqText: {
    fontSize: 14,
    fontWeight: '500',
  },

  // --- סטייל לכפתור שמירה ---
  buttonSection: { marginTop: 30, marginBottom: 50 }, // ריווח גדול בסוף המסך
  savingRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12, // ריווח קצת יותר גדול
  },
  savingText: { marginLeft: 8, color: '#757575' },
  saveButton: {
    paddingVertical: 15, // הגדלנו את הגובה
    borderRadius: 15, // פינות עגולות במיוחד
    alignItems: "center",
    elevation: 3, // צל קל לאפקט מודרני יותר (אנדרואיד)
    shadowColor: "#000", // צל קל (iOS)
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  saveButtonText: {
    color: "#FFFFFF", // צבע טקסט לבן לכפתור צבעוני
    fontWeight: "800", // מודגש מאוד
    fontSize: 17, // גופן גדול יותר
  },
});