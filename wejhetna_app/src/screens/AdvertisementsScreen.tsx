/**
 * Public list of approved advertisements (GET /advertisements).
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Modal,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Ionicons from "react-native-vector-icons/Ionicons";
import { RootStackParamList } from "../navigation/types";
import {
  fetchPublicAdvertisements,
  PublicAdvertisement,
} from "../api/advertisements";
import { fetchCities, fetchCategories, City, Category } from "../api/places";
import AdvertisementCard from "../components/AdvertisementCard";

const DARK_TEAL = "#0f5b63";
const BG = "#f4fbfb";
const MUTED = "#6b8a8e";
const BORDER = "#d4e8ea";

type Nav = NativeStackNavigationProp<RootStackParamList>;

function sortAdvertisementsNewestFirst(list: PublicAdvertisement[]) {
  return [...list].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

function labelCity(c: City, lang: string) {
  if (lang === "he" && c.name_he) return c.name_he;
  if (lang === "ar" && c.name_ar) return c.name_ar;
  return c.name_en || c.name_ar || c.name_he || String(c.id);
}

function labelCategory(c: Category, lang: string) {
  if (lang === "he" && c.name_he) return c.name_he;
  if (lang === "ar" && c.name_ar) return c.name_ar;
  return c.name_en || c.name_ar || c.name_he || String(c.id);
}

export default function AdvertisementsScreen() {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<Nav>();
  const isRTL = i18n.dir() === "rtl";
  const lang = i18n.language || "ar";

  const [items, setItems] = useState<PublicAdvertisement[]>([]);
  const [listBusy, setListBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [cities, setCities] = useState<City[]>([]);
  /** All categories (for id resolution + map labels); chips use active subset only. */
  const [categories, setCategories] = useState<Category[]>([]);
  const [cityFilter, setCityFilter] = useState<number | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<number | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [citiesRes, categoriesRes] = await Promise.all([
          fetchCities(),
          fetchCategories(),
        ]);
        if (!alive) return;
        setCities(citiesRes);
        setCategories(categoriesRes);
      } catch (e) {
        console.error(e);
        Alert.alert(t("error"), t("advertisements.loadFailedMeta"));
      }
    })();
    return () => {
      alive = false;
    };
  }, [t]);

  const activeCategories = React.useMemo(
    () => categories.filter((c) => c.is_active !== false),
    [categories]
  );

  const OTHER_CATEGORY_ID = React.useMemo(() => {
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

  const ONLINE_CITY_ID = React.useMemo(() => {
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

  const resolvedCategoryFilter = categoryFilter === -1 ? OTHER_CATEGORY_ID : categoryFilter;
  const resolvedCityFilter = cityFilter === -1 ? ONLINE_CITY_ID : cityFilter;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setListBusy(true);
        const list = await fetchPublicAdvertisements({
          cityId: resolvedCityFilter ?? undefined,
          categoryId: resolvedCategoryFilter ?? undefined,
        });
        if (alive) setItems(sortAdvertisementsNewestFirst(list));
      } catch (e) {
        console.error(e);
        Alert.alert(t("error"), t("advertisements.loadFailed"));
      } finally {
        if (alive) setListBusy(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [resolvedCityFilter, resolvedCategoryFilter, t]);

  const applyCategoryFilter = useCallback((v: number | null) => {
    setCategoryFilter(v);
    setFiltersOpen(false);
  }, []);

  const applyCityFilter = useCallback((v: number | null) => {
    setCityFilter(v);
    setFiltersOpen(false);
  }, []);

  const clearFiltersAndClose = useCallback(() => {
    setCityFilter(null);
    setCategoryFilter(null);
    setFiltersOpen(false);
  }, []);

  const onRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      const list = await fetchPublicAdvertisements({
        cityId: resolvedCityFilter ?? undefined,
        categoryId: resolvedCategoryFilter ?? undefined,
      });
      setItems(sortAdvertisementsNewestFirst(list));
    } catch (e) {
      Alert.alert(t("error"), t("advertisements.loadFailed"));
    } finally {
      setRefreshing(false);
    }
  }, [resolvedCityFilter, resolvedCategoryFilter, t]);

  const cityMap = React.useMemo(() => {
    const m = new Map<number, City>();
    cities.forEach((c) => m.set(c.id, c));
    return m;
  }, [cities]);
  const categoryMap = React.useMemo(() => {
    const m = new Map<number, Category>();
    categories.forEach((c) => m.set(c.id, c));
    return m;
  }, [categories]);

  const renderItem = useCallback(
    ({ item }: { item: PublicAdvertisement }) => (
      <AdvertisementCard
        item={item}
        subtitle={
          (() => {
            const c = categoryMap.get(item.category_id);
            const city = cityMap.get(item.city_id);
            const left = c ? labelCategory(c, lang) : null;
            const right = city ? labelCity(city, lang) : null;
            if (left && right) return isRTL ? `${right} • ${left}` : `${left} • ${right}`;
            return left || right || undefined;
          })()
        }
        onPress={() =>
          navigation.navigate("AdvertisementDetails", {
            advertisementId: item.id,
            advertisements: items,
          })
        }
      />
    ),
    [categoryMap, cityMap, isRTL, items, lang, navigation]
  );

  if (listBusy && items.length === 0) {
    return (
      <SafeAreaView style={styles.centered} edges={["top", "left", "right"]}>
        <ActivityIndicator size="large" color={DARK_TEAL} />
        <Text style={styles.muted}>{t("advertisements.loading")}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={[styles.headerRow, isRTL && styles.rowRTL]}>
        <View style={styles.headerSpacer} />
        <Text style={[styles.headerTitle, isRTL && styles.textRTL]}>
          {t("advertisements.listTitle")}
        </Text>
        <TouchableOpacity
          style={styles.filterBtn}
          onPress={() => setFiltersOpen(true)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t("advertisements.filters")}
        >
          <Ionicons name="options-outline" size={22} color={DARK_TEAL} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={items}
        keyExtractor={(it) => String(it.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListHeaderComponent={
          listBusy && items.length > 0 ? (
            <View style={styles.inlineBusy}>
              <ActivityIndicator color={DARK_TEAL} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          !listBusy ? (
            <Text style={[styles.empty, isRTL && styles.textRTL]}>
              {t("advertisements.noData")}
            </Text>
          ) : null
        }
      />

      <Modal
        visible={filtersOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setFiltersOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, isRTL && styles.modalCardRTL]}>
            <View style={[styles.modalHeader, isRTL && styles.rowRTL]}>
              <Text style={[styles.modalTitle, isRTL && styles.textRTL]}>
                {t("advertisements.filters")}
              </Text>
              <TouchableOpacity
                onPress={() => setFiltersOpen(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={22} color={MUTED} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalLabel, styles.modalLabelFirst, isRTL && styles.textRTL]}>
              {t("advertisements.category")}
            </Text>
            <View style={styles.optionWrap}>
              <TouchableOpacity
                style={[styles.optionChip, categoryFilter == null && styles.optionChipOn]}
                onPress={() => applyCategoryFilter(null)}
              >
                <Text style={[styles.optionChipText, categoryFilter == null && styles.optionChipTextOn]}>
                  {t("advertisements.allCategories")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.optionChip, categoryFilter === -1 && styles.optionChipOn]}
                onPress={() => applyCategoryFilter(-1)}
              >
                <Text style={[styles.optionChipText, categoryFilter === -1 && styles.optionChipTextOn]}>
                  {t("advertisements.otherOption")}
                </Text>
              </TouchableOpacity>
              {activeCategories.map((c) => (
                <TouchableOpacity
                  key={`cat-opt-${c.id}`}
                  style={[styles.optionChip, categoryFilter === c.id && styles.optionChipOn]}
                  onPress={() => applyCategoryFilter(c.id)}
                >
                  <Text style={[styles.optionChipText, categoryFilter === c.id && styles.optionChipTextOn]}>
                    {labelCategory(c, lang)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.modalLabel, isRTL && styles.textRTL]}>
              {t("advertisements.city")}
            </Text>
            <View style={styles.optionWrap}>
              <TouchableOpacity
                style={[styles.optionChip, cityFilter == null && styles.optionChipOn]}
                onPress={() => applyCityFilter(null)}
              >
                <Text style={[styles.optionChipText, cityFilter == null && styles.optionChipTextOn]}>
                  {t("advertisements.allCities")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.optionChip, cityFilter === -1 && styles.optionChipOn]}
                onPress={() => applyCityFilter(-1)}
              >
                <Text style={[styles.optionChipText, cityFilter === -1 && styles.optionChipTextOn]}>
                  {t("advertisements.onlineBusinessOption")}
                </Text>
              </TouchableOpacity>
              {cities.map((c) => (
                <TouchableOpacity
                  key={`city-opt-${c.id}`}
                  style={[styles.optionChip, cityFilter === c.id && styles.optionChipOn]}
                  onPress={() => applyCityFilter(c.id)}
                >
                  <Text style={[styles.optionChipText, cityFilter === c.id && styles.optionChipTextOn]}>
                    {labelCity(c, lang)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.clearFiltersOnly, isRTL && styles.rowRTL]}
              onPress={clearFiltersAndClose}
              activeOpacity={0.85}
            >
              <Text style={[styles.clearFiltersOnlyText, isRTL && styles.textRTL]}>
                {t("advertisements.clearFilters")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: BG,
  },
  muted: { marginTop: 10, color: MUTED, fontSize: 15 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  rowRTL: { flexDirection: "row-reverse" },
  textRTL: { textAlign: "right", writingDirection: "rtl" },
  headerSpacer: { width: 44, height: 44 },
  filterBtn: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: DARK_TEAL,
    flex: 1,
    textAlign: "center",
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  listContent: { paddingTop: 8, paddingBottom: 32 },
  inlineBusy: { paddingVertical: 10, alignItems: "center" },
  empty: {
    textAlign: "center",
    color: MUTED,
    marginTop: 40,
    paddingHorizontal: 24,
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  modalCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  modalCardRTL: { alignItems: "stretch" },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: DARK_TEAL,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  modalLabel: {
    marginTop: 16,
    marginBottom: 10,
    fontSize: 13,
    fontWeight: "700",
    color: MUTED,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  modalLabelFirst: {
    marginTop: 4,
  },
  optionWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  optionChip: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  optionChipOn: {
    backgroundColor: "#e8f4f5",
    borderColor: DARK_TEAL,
  },
  optionChipText: {
    fontSize: 13,
    fontWeight: "700",
    color: MUTED,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  optionChipTextOn: { color: DARK_TEAL },
  clearFiltersOnly: {
    marginTop: 18,
    paddingVertical: 10,
    alignItems: "center",
  },
  clearFiltersOnlyText: {
    fontSize: 14,
    fontWeight: "700",
    color: MUTED,
    textDecorationLine: "underline",
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
});
