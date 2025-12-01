// src/screens/AdminPlaceFormScreen.tsx
import { useTranslation } from "react-i18next";

import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Button,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import { useNavigation, useRoute } from "@react-navigation/native";

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
  const { t } = useTranslation();
  const route = useRoute();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const params = route.params as AdminPlaceFormRouteParams | undefined;

  // טופס
  const [name, setName] = useState("");
  const [placeType, setPlaceType] = useState<PlaceType>("PUBLIC_SERVICE");
  const [cityId, setCityId] = useState<number | undefined>(undefined);
  const [categoryId, setCategoryId] = useState<number | undefined>(undefined);

  const [description, setDescription] = useState("");
  const [phone, setPhone] = useState("");
  const [openingHours, setOpeningHours] = useState("");

  // מיקום שנבחר במפה
  const [lat, setLat] = useState<number | undefined>(undefined);
  const [lon, setLon] = useState<number | undefined>(undefined);

  // דאטה לעזרים
  const [cities, setCities] = useState<City[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // בכל פעם שמגיעים עם params חדשים מהמפה – לעדכן
  useEffect(() => {
    if (params?.pickedLat && params?.pickedLon) {
      setLat(params.pickedLat);
      setLon(params.pickedLon);
    }
  }, [params?.pickedLat, params?.pickedLon]);

  // טעינת ערים וקטגוריות
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
          // שורה זו פותרת את הבעיה
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

  function handleOpenMap() {
    navigation.navigate("AdminPlaceMapPicker", {
      initialLat: lat ?? 31.25,
      initialLon: lon ?? 34.8,
    });
  }


  async function handleSubmit() {
    if (!name.trim()) {
      Alert.alert("שגיאה", "שם המקום חובה");
      return;
    }

    if (!cityId) {
      Alert.alert("שגיאה", "חובה לבחור עיר");
      return;
    }

    if (placeType === "BUSINESS" && !categoryId) {
      Alert.alert("שגיאה", "לעסק חובה לבחור קטגוריה");
      return;
    }

    if (lat === undefined || lon === undefined) {
      Alert.alert("שגיאה", "חובה לבחור מיקום על המפה");
      return;
    }

    try {
      setCreating(true);

      await createAdminPlace({
        name,
        place_type: placeType,
        city_id: cityId,
        category_id: categoryId ?? null,
        can_be_claimed: true,
        description: description || null,
        phone: phone || null,
        opening_hours: openingHours || null,
        main_image_url: null,
        social_links: null,
        owner_user_id: null,
        lat,
        lon,
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

      <Text style={styles.label}>עיר</Text>
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
          <Text style={styles.label}>קטגוריה (לעסק)</Text>
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
        style={styles.input}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
      />

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
            <Text style={styles.locationText}>לא נבחר עדיין</Text>
          )}
        </View>
        <Button title="בחר מיקום על המפה" onPress={handleOpenMap} />
      </View>

      <View style={{ marginTop: 16 }}>
        {creating ? (
          <ActivityIndicator />
        ) : (
          <Button title="שמור מקום" onPress={handleSubmit} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
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
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  locationText: {
    color: "#555",
  },
});
