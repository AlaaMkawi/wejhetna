/**
 * Create Advertisement — submit image + category + city (+ optional description).
 * POST /advertisements (multipart). Requires logged-in user (user_id in form).
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Ionicons from "react-native-vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  launchImageLibrary,
  launchCamera,
  Asset,
} from "react-native-image-picker";
import { RootStackParamList } from "../navigation/types";
import { fetchCities, fetchCategories, City, Category } from "../api/places";
import { createAdvertisementRequest } from "../api/advertisements";

const MAX_BYTES = 5 * 1024 * 1024;
const DARK_TEAL = "#0f5b63";
const SOFT_TEAL = "#3a8d96";
const BG = "#f4fbfb";
const CARD = "#ffffff";
const MUTED = "#6b8a8e";
const BORDER = "#d4e8ea";
const SHADOW = "#0f5b6322";

type Nav = NativeStackNavigationProp<RootStackParamList>;

const pickerOptions = {
  mediaType: "photo" as const,
  quality: 0.8 as const,
  maxWidth: 2048,
  maxHeight: 2048,
};

function labelCity(c: City, lang: string) {
  if (lang === "he" && c.name_he) return c.name_he;
  if (lang === "ar" && c.name_ar) return c.name_ar;
  return c.name_en || c.name_ar || c.name_he || `City ${c.id}`;
}

function labelCategory(c: Category, lang: string) {
  if (lang === "he" && c.name_he) return c.name_he;
  if (lang === "ar" && c.name_ar) return c.name_ar;
  return c.name_en || c.name_ar || c.name_he || `Category ${c.id}`;
}

export default function CreateAdvertisementScreen() {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<Nav>();
  const isRTL = i18n.dir() === "rtl";
  const lang = i18n.language || "ar";

  const [userId, setUserId] = useState<number | null>(null);
  const [cities, setCities] = useState<City[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);

  const [asset, setAsset] = useState<Asset | null>(null);
  const [cityId, setCityId] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [description, setDescription] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [cityError, setCityError] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  const activeCategories = useMemo(
    () => categories.filter((c) => c.is_active !== false),
    [categories]
  );

  /** Resolve from full list so inactive "Other" still maps (FK must exist in DB). */
  const OTHER_CATEGORY_ID = useMemo(() => {
    const hit = categories.find((c) => {
      const s = `${c.name_en || ""} ${c.name_ar || ""} ${c.name_he || ""}`.toLowerCase();
      return (
        s.includes("other") ||
        s.includes("أخرى") ||
        s.includes("اخرى") ||
        s.includes("אחר") ||
        s.includes("misc") ||
        s.includes("miscellaneous")
      );
    });
    return hit?.id ?? null;
  }, [categories]);

  const ONLINE_CITY_ID = useMemo(() => {
    const hit = cities.find((c) => {
      const s = `${c.name_en || ""} ${c.name_ar || ""} ${c.name_he || ""}`.toLowerCase();
      const ar = c.name_ar || "";
      return (
        s.includes("online business") ||
        (s.includes("online") && s.includes("business")) ||
        s.includes("أعمال عبر الإنترنت") ||
        (ar.includes("أعمال") && ar.includes("إنترنت")) ||
        s.includes("עסק אונליין") ||
        s.includes("אונליין") ||
        s.includes("internet")
      );
    });
    return hit?.id ?? null;
  }, [cities]);

  const resolvedCategoryId = categoryId === -1 ? OTHER_CATEGORY_ID : categoryId;
  const resolvedCityId = cityId === -1 ? ONLINE_CITY_ID : cityId;

  const canSubmit =
    !!userId &&
    !!asset?.uri &&
    resolvedCityId != null &&
    resolvedCategoryId != null &&
    !submitting;

  const loadMeta = useCallback(async () => {
    setLoadingMeta(true);
    try {
      const uid = await AsyncStorage.getItem("userId");
      if (uid) setUserId(parseInt(uid, 10));
      else setUserId(null);

      const [citiesRes, categoriesRes] = await Promise.all([
        fetchCities(),
        fetchCategories(),
      ]);
      setCities(citiesRes);
      setCategories(categoriesRes);
    } catch (e) {
      console.error(e);
      Alert.alert(t("error"), t("advertisements.loadFailedMeta"));
    } finally {
      setLoadingMeta(false);
    }
  }, [t]);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  function applyAsset(next: Asset | undefined) {
    setImageError(null);
    if (!next?.uri) return;
    if (next.fileSize != null && next.fileSize > MAX_BYTES) {
      setImageError(t("advertisements.errors.imageTooLarge"));
      return;
    }
    setAsset(next);
  }

  function pickFromLibrary() {
    launchImageLibrary(
      { ...pickerOptions, selectionLimit: 1 },
      (res) => {
        if (res.didCancel || res.errorCode) return;
        applyAsset(res.assets?.[0]);
      }
    );
  }

  function pickFromCamera() {
    launchCamera({ ...pickerOptions, saveToPhotos: true }, (res) => {
      if (res.didCancel || res.errorCode) return;
      applyAsset(res.assets?.[0]);
    });
  }

  function clearImage() {
    setAsset(null);
    setImageError(null);
  }

  function resetForm() {
    setAsset(null);
    setCityId(null);
    setCategoryId(null);
    setDescription("");
    setImageError(null);
    setCityError(null);
    setCategoryError(null);
  }

  async function onSubmit() {
    if (!userId) {
      Alert.alert(t("error"), t("advertisements.mustLogin"));
      return;
    }
    if (!asset?.uri) {
      setImageError(t("advertisements.errors.imageRequired"));
      return;
    }
    if (resolvedCityId == null) {
      setCityError(t("advertisements.errors.cityRequired"));
      return;
    }
    if (resolvedCategoryId == null) {
      setCategoryError(t("advertisements.errors.categoryRequired"));
      return;
    }
    if (cityId === -1 && ONLINE_CITY_ID == null) {
      setCityError(t("advertisements.errors.optionUnavailable"));
      return;
    }
    if (categoryId === -1 && OTHER_CATEGORY_ID == null) {
      setCategoryError(t("advertisements.errors.optionUnavailable"));
      return;
    }

    setSubmitting(true);
    setCityError(null);
    setCategoryError(null);
    try {
      await createAdvertisementRequest({
        userId,
        categoryId: resolvedCategoryId!,
        cityId: resolvedCityId!,
        description: description.trim() || undefined,
        imageUri: asset.uri,
        imageType: asset.type,
        imageName: asset.fileName ?? undefined,
      });
      Alert.alert(t("success"), t("advertisements.successMessage"), [
        { text: t("ok"), onPress: () => resetForm() },
      ]);
    } catch (e: any) {
      const msg = e?.message || String(e);
      Alert.alert(t("error"), msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingMeta) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={DARK_TEAL} />
        <Text style={styles.loadingText}>{t("advertisements.loading")}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header */}
        <View style={[styles.headerRow, isRTL && styles.rowRTL]}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons
              name={isRTL ? "chevron-forward" : "chevron-back"}
              size={26}
              color={DARK_TEAL}
            />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {t("advertisements.createTitle")}
          </Text>
          <View style={styles.backBtn} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Image card */}
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>
              {t("advertisements.imageSection")}{" "}
              <Text style={styles.req}>*</Text>
            </Text>
            <TouchableOpacity
              style={styles.imageFrame}
              activeOpacity={0.9}
              onPress={pickFromLibrary}
            >
              {asset?.uri ? (
                <Image
                  source={{ uri: asset.uri }}
                  style={styles.preview}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.placeholder}>
                  <Ionicons name="image-outline" size={48} color={SOFT_TEAL} />
                  <Text style={styles.placeholderHint}>
                    {t("advertisements.tapToChoose")}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            {imageError ? (
              <Text style={styles.fieldError}>{imageError}</Text>
            ) : null}
            <View style={[styles.imageActions, isRTL && styles.rowRTL]}>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={pickFromLibrary}
              >
                <Ionicons
                  name="images-outline"
                  size={18}
                  color={DARK_TEAL}
                  style={styles.secondaryIcon}
                />
                <Text style={styles.secondaryBtnText}>
                  {t("advertisements.uploadImage")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={pickFromCamera}
              >
                <Ionicons
                  name="camera-outline"
                  size={18}
                  color={DARK_TEAL}
                  style={styles.secondaryIcon}
                />
                <Text style={styles.secondaryBtnText}>
                  {t("advertisements.takePhoto")}
                </Text>
              </TouchableOpacity>
              {asset?.uri ? (
                <TouchableOpacity style={styles.textBtn} onPress={clearImage}>
                  <Text style={styles.textBtnLabel}>
                    {t("advertisements.replaceImage")}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {/* Category pills */}
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>
              {t("advertisements.category")}{" "}
              <Text style={styles.req}>*</Text>
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.pillsRow}
            >
              <TouchableOpacity
                key="cat-other"
                style={[styles.pill, categoryId === -1 && styles.pillSelected]}
                onPress={() => {
                  setCategoryId(-1 as any);
                  setCategoryError(null);
                }}
                activeOpacity={0.85}
              >
                <Text
                  style={[styles.pillText, categoryId === -1 && styles.pillTextSel]}
                  numberOfLines={1}
                >
                  {t("advertisements.otherOption")}
                </Text>
              </TouchableOpacity>
              {activeCategories.map((c) => {
                const selected = categoryId === c.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.pill, selected && styles.pillSelected]}
                    onPress={() => {
                      setCategoryId(c.id);
                      setCategoryError(null);
                    }}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[styles.pillText, selected && styles.pillTextSel]}
                      numberOfLines={1}
                    >
                      {labelCategory(c, lang)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {categoryError ? (
              <Text style={styles.fieldError}>{categoryError}</Text>
            ) : null}
          </View>

          {/* City pills */}
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>
              {t("advertisements.city")} <Text style={styles.req}>*</Text>
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.pillsRow}
            >
              <TouchableOpacity
                key="city-online"
                style={[styles.pill, cityId === -1 && styles.pillSelected]}
                onPress={() => {
                  setCityId(-1 as any);
                  setCityError(null);
                }}
                activeOpacity={0.85}
              >
                <Text
                  style={[styles.pillText, cityId === -1 && styles.pillTextSel]}
                  numberOfLines={1}
                >
                  {t("advertisements.onlineBusinessOption")}
                </Text>
              </TouchableOpacity>
              {cities.map((c) => {
                const selected = cityId === c.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.pill, selected && styles.pillSelected]}
                    onPress={() => {
                      setCityId(c.id);
                      setCityError(null);
                    }}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[styles.pillText, selected && styles.pillTextSel]}
                      numberOfLines={1}
                    >
                      {labelCity(c, lang)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {cityError ? (
              <Text style={styles.fieldError}>{cityError}</Text>
            ) : null}
          </View>

          {/* Description */}
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>
              {t("advertisements.description")}{" "}
              <Text style={styles.optional}>
                ({t("advertisements.optional")})
              </Text>
            </Text>
            <TextInput
              style={[styles.textArea, isRTL && styles.inputRTL]}
              placeholder={t("advertisements.descriptionPlaceholder")}
              placeholderTextColor={MUTED}
              value={description}
              onChangeText={setDescription}
              multiline
              maxLength={400}
              numberOfLines={3}
              textAlignVertical="top"
              textAlign={isRTL ? "right" : "left"}
            />
          </View>

          <TouchableOpacity
            style={[
              styles.submitBtn,
              !canSubmit && styles.submitBtnDisabled,
            ]}
            onPress={onSubmit}
            disabled={!canSubmit}
            activeOpacity={0.9}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <View style={styles.submitInner}>
                <Ionicons name="send" size={20} color="#fff" />
                <Text style={styles.submitText}>
                  {t("advertisements.submitAdvertisement")}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          <Text style={styles.footerHint}>
            {t("advertisements.maxSizeHint")}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  flex: { flex: 1 },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: BG,
  },
  loadingText: { marginTop: 12, color: MUTED, fontSize: 15 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  rowRTL: { flexDirection: "row-reverse" },
  backBtn: { width: 44, height: 44, justifyContent: "center", alignItems: "center" },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: DARK_TEAL,
    letterSpacing: 0.3,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: SHADOW,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: BORDER,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: DARK_TEAL,
    marginBottom: 12,
  },
  req: { color: "#c0392b" },
  optional: { fontWeight: "400", color: MUTED, fontSize: 13 },
  imageFrame: {
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#e8f4f5",
    minHeight: 220,
    borderWidth: 1,
    borderColor: BORDER,
  },
  preview: { width: "100%", minHeight: 220 },
  placeholder: {
    minHeight: 220,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  placeholderHint: {
    marginTop: 10,
    color: MUTED,
    fontSize: 14,
    textAlign: "center",
  },
  imageActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    marginTop: 12,
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "#e8f4f5",
    borderWidth: 1,
    borderColor: BORDER,
    marginRight: 8,
    marginBottom: 8,
  },
  secondaryIcon: { marginRight: 8 },
  secondaryBtnText: {
    color: DARK_TEAL,
    fontWeight: "600",
    fontSize: 14,
  },
  textBtn: { paddingHorizontal: 10, paddingVertical: 8 },
  textBtnLabel: { color: SOFT_TEAL, fontWeight: "600", fontSize: 14 },
  fieldError: { color: "#c0392b", fontSize: 13, marginTop: 8 },
  pillsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingRight: 4,
  },
  pill: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: "#eef8f9",
    borderWidth: 1,
    borderColor: BORDER,
    maxWidth: 280,
    marginRight: 10,
  },
  pillSelected: {
    backgroundColor: DARK_TEAL,
    borderColor: DARK_TEAL,
  },
  pillText: {
    color: DARK_TEAL,
    fontSize: 14,
    fontWeight: "500",
  },
  pillTextSel: { color: "#fff" },
  textArea: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    padding: 14,
    fontSize: 15,
    color: "#1a2e32",
    minHeight: 88,
    maxHeight: 100,
    backgroundColor: "#fafdfd",
  },
  inputRTL: { textAlign: "right" },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: DARK_TEAL,
    paddingVertical: 16,
    borderRadius: 16,
    marginTop: 4,
    shadowColor: DARK_TEAL,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  submitBtnDisabled: {
    backgroundColor: "#8fafb3",
    shadowOpacity: 0,
    elevation: 0,
  },
  submitInner: { flexDirection: "row", alignItems: "center" },
  submitText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.3,
    marginLeft: 10,
  },
  footerHint: {
    textAlign: "center",
    color: MUTED,
    fontSize: 12,
    marginTop: 16,
    lineHeight: 18,
  },
});
