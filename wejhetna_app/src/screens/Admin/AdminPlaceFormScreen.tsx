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
        <ActivityIndicator />
        <Text>טוען ערים וקטגוריות...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <View style={styles.container}>
        <Text style={styles.label}>שם המקום *</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="למשל: מרפאת אם וילד"
        />

        <Text style={styles.label}>סוג המקום</Text>
        <Picker
          selectedValue={placeType}
          onValueChange={(val) => setPlaceType(val as PlaceType)}
          style={styles.picker}
        >
          <Picker.Item label="שירות ציבורי" value="PUBLIC_SERVICE" />
          <Picker.Item label="עסק" value="BUSINESS" />
        </Picker>

        <Text style={styles.label}>עיר *</Text>
        <Picker
          selectedValue={cityId}
          onValueChange={(val) => setCityId(val as number)}
          style={styles.picker}
        >
          {cities.map((c) => (
            <Picker.Item
              key={c.id}
              label={`${c.name_ar} ${c.name_he ? `(${c.name_he})` : ""}`}
              value={c.id}
            />
          ))}
        </Picker>

        {placeType === "BUSINESS" && (
          <>
            <Text style={styles.label}>קטגוריה (לעסק) *</Text>
            <Picker
              selectedValue={categoryId}
              onValueChange={(val) => setCategoryId(val as number)}
              style={styles.picker}
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
          </>
        )}

        <Text style={styles.label}>תיאור</Text>
        <TextInput
          style={[styles.input, { height: 70 }]}
          value={description}
          onChangeText={setDescription}
          multiline
        />

        <Text style={styles.label}>טלפון</Text>
        <TextInput
          style={[
            styles.input,
            phoneTouched && !isPhoneValid && { borderColor: "red" },
          ]}
          value={phone}
          onChangeText={handlePhoneChange}
          onBlur={handlePhoneBlur}
          keyboardType="phone-pad"
          placeholder="למשל: 0541234567"
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
                מכיל רק ספרות (0–9)
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
        />

        <View style={styles.locationRow}>
          <View>
            <Text style={styles.label}>מיקום על המפה *</Text>
            {lat !== undefined && lon !== undefined ? (
              <Text style={styles.locationText}>
                lat: {lat.toFixed(5)}, lon: {lon.toFixed(5)}
              </Text>
            ) : (
              <Text style={[styles.locationText, { color: "red" }]}>
                חובה לבחור מיקום במסך המפה (Admin Map)
              </Text>
            )}
          </View>
        </View>

        <View style={{ marginTop: 16 }}>
          {creating && (
            <View style={styles.savingRow}>
              <ActivityIndicator />
              <Text style={{ marginLeft: 8 }}>שומר מקום...</Text>
            </View>
          )}

          <TouchableOpacity
            style={[
              styles.saveButton,
              { backgroundColor: canSubmit ? "#9bd3d8" : "#cccccc" },
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
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  label: { fontWeight: "600", marginTop: 8, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  picker: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
  },
  locationRow: {
    marginTop: 16,
  },
  locationText: {
    color: "#555",
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
  savingRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  saveButton: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  saveButtonText: {
    color: "#000",
    fontWeight: "600",
    fontSize: 16,
  },
});