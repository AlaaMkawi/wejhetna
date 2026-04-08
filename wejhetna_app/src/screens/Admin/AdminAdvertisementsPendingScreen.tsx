import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  StatusBar,
  Platform,
  ScrollView,
  Animated,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { RootStackParamList } from "../../navigation/types";
import {
  fetchPendingAdvertisements,
  AdminPendingAdvertisement,
} from "../../api/advertisements";
import { fetchCities, fetchCategories, City, Category } from "../../api/places";
import AdminAdvertisementPendingCard from "../../components/AdminAdvertisementPendingCard";

const DARK_TEAL = "#0f5b63";
const SOFT_TEAL = "#3a8d96";
const BG = "#f4fbfb";
const MUTED = "#64748b";

type Props = NativeStackScreenProps<RootStackParamList, "AdminAdvertisementsPending">;

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

function formatCreatedAt(iso: string, lang: string): string {
  try {
    const d = new Date(iso);
    const loc = lang === "he" ? "he-IL" : "ar";
    return d.toLocaleString(loc, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function PendingSkeleton({ isRTL }: { isRTL: boolean }) {
  const pulse = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.9,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.45,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View style={[styles.skeletonCard, { opacity: pulse }]}>
      <View style={styles.skeletonImage} />
      <View style={[styles.skeletonPad, isRTL && styles.padRTL]}>
        <View style={[styles.skeletonLine, { width: "55%" }]} />
        <View style={[styles.skeletonLine, { width: "80%", marginTop: 10 }]} />
        <View style={[styles.skeletonLine, { width: "40%", marginTop: 10 }]} />
      </View>
    </Animated.View>
  );
}

export default function AdminAdvertisementsPendingScreen({ route, navigation }: Props) {
  const { t, i18n } = useTranslation();
  const { adminUserId, role } = route.params;
  const lang = i18n.language || "ar";
  const isRTL = i18n.dir() === "rtl";

  const [items, setItems] = useState<AdminPendingAdvertisement[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedOnce = useRef(false);

  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [cityId, setCityId] = useState<number | null>(null);
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");

  const activeCategories = useMemo(
    () => categories.filter((c) => c.is_active !== false),
    [categories]
  );

  const loadMeta = useCallback(async () => {
    try {
      const [cits, cats] = await Promise.all([fetchCities(), fetchCategories()]);
      setCities(cits);
      setCategories(cats);
    } catch {
      /* meta errors surfaced on list fetch */
    }
  }, []);

  const loadList = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchPendingAdvertisements({
        adminUserId,
        categoryId: categoryId ?? undefined,
        cityId: cityId ?? undefined,
      });
      setItems(data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setItems([]);
    }
  }, [adminUserId, categoryId, cityId]);

  const skipFilterEffect = useRef(true);
  useEffect(() => {
    if (skipFilterEffect.current) {
      skipFilterEffect.current = false;
      return;
    }
    (async () => {
      await loadList();
    })();
  }, [categoryId, cityId, loadList]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const first = !hasLoadedOnce.current;
        try {
          if (first) {
            setLoading(true);
            await loadMeta();
          }
          await loadList();
        } finally {
          if (!cancelled && first) {
            hasLoadedOnce.current = true;
            setLoading(false);
          }
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [loadMeta, loadList])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadList();
    setRefreshing(false);
  }, [loadList]);

  const sortedItems = useMemo(() => {
    const copy = [...items];
    copy.sort((a, b) => {
      const ta = new Date(a.created_at).getTime();
      const tb = new Date(b.created_at).getTime();
      return sortOrder === "newest" ? tb - ta : ta - tb;
    });
    return copy;
  }, [items, sortOrder]);

  const cityById = useMemo(() => {
    const m = new Map<number, City>();
    cities.forEach((c) => m.set(c.id, c));
    return m;
  }, [cities]);

  const categoryById = useMemo(() => {
    const m = new Map<number, Category>();
    activeCategories.forEach((c) => m.set(c.id, c));
    return m;
  }, [activeCategories]);

  const renderFilters = () => (
    <View style={styles.filtersBlock}>
      <Text style={[styles.filtersMainTitle, isRTL && styles.textRTL]}>
        {t("advertisements.admin.filtersLabel")}
      </Text>
      <Text style={[styles.filterSectionTitle, isRTL && styles.textRTL]}>
        {t("advertisements.category")}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.chipsRow, isRTL && styles.chipsRowRTL]}
      >
        <TouchableOpacity
          style={[styles.filterChip, categoryId === null && styles.filterChipOn]}
          onPress={() => setCategoryId(null)}
        >
          <Text
            style={[
              styles.filterChipText,
              categoryId === null && styles.filterChipTextOn,
            ]}
            numberOfLines={1}
          >
            {t("advertisements.allCategories")}
          </Text>
        </TouchableOpacity>
        {activeCategories.map((c) => (
          <TouchableOpacity
            key={c.id}
            style={[styles.filterChip, categoryId === c.id && styles.filterChipOn]}
            onPress={() => setCategoryId(c.id)}
          >
            <Text
              style={[
                styles.filterChipText,
                categoryId === c.id && styles.filterChipTextOn,
              ]}
              numberOfLines={1}
            >
              {labelCategory(c, lang)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={[styles.filterSectionTitle, styles.filterSectionTitleSpaced, isRTL && styles.textRTL]}>
        {t("advertisements.city")}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.chipsRow, isRTL && styles.chipsRowRTL]}
      >
        <TouchableOpacity
          style={[styles.filterChip, cityId === null && styles.filterChipOn]}
          onPress={() => setCityId(null)}
        >
          <Text
            style={[styles.filterChipText, cityId === null && styles.filterChipTextOn]}
            numberOfLines={1}
          >
            {t("advertisements.allCities")}
          </Text>
        </TouchableOpacity>
        {cities.map((c) => (
          <TouchableOpacity
            key={c.id}
            style={[styles.filterChip, cityId === c.id && styles.filterChipOn]}
            onPress={() => setCityId(c.id)}
          >
            <Text
              style={[styles.filterChipText, cityId === c.id && styles.filterChipTextOn]}
              numberOfLines={1}
            >
              {labelCity(c, lang)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={[styles.filterSectionTitle, styles.filterSectionTitleSpaced, isRTL && styles.textRTL]}>
        {t("advertisements.admin.sortLabel")}
      </Text>
      <View style={[styles.sortRow, isRTL && styles.sortRowRTL]}>
        <TouchableOpacity
          style={[styles.sortChip, sortOrder === "newest" && styles.sortChipOn]}
          onPress={() => setSortOrder("newest")}
        >
          <Text style={[styles.sortChipText, sortOrder === "newest" && styles.sortChipTextOn]}>
            {t("advertisements.admin.sortNewest")}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sortChip, sortOrder === "oldest" && styles.sortChipOn]}
          onPress={() => setSortOrder("oldest")}
        >
          <Text style={[styles.sortChipText, sortOrder === "oldest" && styles.sortChipTextOn]}>
            {t("advertisements.admin.sortOldest")}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const listHeader = () => (
    <View>
      {renderFilters()}
      {error ? (
        <Text style={[styles.errorBanner, isRTL && styles.textRTL]}>{error}</Text>
      ) : null}
    </View>
  );

  const listEmpty = () => {
    if (loading) return null;
    return (
      <View style={styles.emptyWrap}>
        <View style={styles.emptyIconCircle}>
          <Ionicons name="document-text-outline" size={44} color={SOFT_TEAL} />
        </View>
        <Text style={[styles.emptyTitle, isRTL && styles.textRTL]}>
          {t("advertisements.admin.noPending")}
        </Text>
        <Text style={[styles.emptySub, isRTL && styles.textRTL]}>
          {t("advertisements.admin.emptyHint")}
        </Text>
      </View>
    );
  };

  if (loading && items.length === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <StatusBar barStyle="dark-content" backgroundColor={BG} />
        <View style={[styles.topBar, isRTL && styles.topBarRTL]}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name={isRTL ? "chevron-forward" : "chevron-back"} size={26} color={DARK_TEAL} />
          </TouchableOpacity>
          <Text style={[styles.screenTitle, isRTL && styles.textRTL]} numberOfLines={1}>
            {t("advertisements.admin.pendingTitle")}
          </Text>
          <View style={styles.backBtnPlaceholder} />
        </View>
        <ScrollView contentContainerStyle={styles.skeletonList} showsVerticalScrollIndicator={false}>
          {[0, 1, 2, 3].map((k) => (
            <PendingSkeleton key={k} isRTL={isRTL} />
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />
      <View style={[styles.topBar, isRTL && styles.topBarRTL]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name={isRTL ? "chevron-forward" : "chevron-back"} size={26} color={DARK_TEAL} />
        </TouchableOpacity>
        <Text style={[styles.screenTitle, isRTL && styles.textRTL]} numberOfLines={1}>
          {t("advertisements.admin.pendingTitle")}
        </Text>
        <View style={styles.backBtnPlaceholder} />
      </View>

      <FlatList
        data={sortedItems}
        keyExtractor={(it) => String(it.id)}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        contentContainerStyle={
          sortedItems.length === 0 ? styles.listEmptyGrow : styles.listContent
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={DARK_TEAL} />
        }
        renderItem={({ item }) => {
          const city = cityById.get(item.city_id);
          const cat = categoryById.get(item.category_id);
          return (
            <AdminAdvertisementPendingCard
              item={item}
              categoryLabel={cat ? labelCategory(cat, lang) : `— ${item.category_id}`}
              cityLabel={city ? labelCity(city, lang) : `— ${item.city_id}`}
              createdDisplay={formatCreatedAt(item.created_at, lang)}
              userLabel={t("advertisements.admin.userLabel")}
              imageAlt={t("advertisements.imageAlt")}
              isRTL={isRTL}
              onPress={() =>
                navigation.navigate("AdminAdvertisementDetails", {
                  adminUserId,
                  role,
                  advertisement: item,
                })
              }
            />
          );
        }}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: BG,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 8,
    backgroundColor: BG,
  },
  topBarRTL: {
    flexDirection: "row-reverse",
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  backBtnPlaceholder: { width: 44 },
  screenTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "700",
    color: DARK_TEAL,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  textRTL: {
    textAlign: "right",
    writingDirection: "rtl",
  },
  filtersBlock: {
    paddingHorizontal: 18,
    paddingBottom: 8,
  },
  filtersMainTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: DARK_TEAL,
    marginBottom: 14,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  filterSectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: MUTED,
    marginBottom: 8,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  filterSectionTitleSpaced: {
    marginTop: 14,
  },
  chipsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingBottom: 4,
  },
  chipsRowRTL: {
    flexDirection: "row-reverse",
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 16,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  filterChipOn: {
    backgroundColor: DARK_TEAL,
    borderColor: DARK_TEAL,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: MUTED,
    maxWidth: 200,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  filterChipTextOn: {
    color: "#fff",
  },
  sortRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  sortRowRTL: {
    flexDirection: "row-reverse",
  },
  sortChip: {
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 16,
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
  },
  sortChipOn: {
    backgroundColor: "#e8f4f5",
    borderColor: SOFT_TEAL,
  },
  sortChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: MUTED,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  sortChipTextOn: {
    color: DARK_TEAL,
  },
  listContent: {
    paddingBottom: 32,
  },
  listEmptyGrow: {
    flexGrow: 1,
    paddingBottom: 32,
  },
  errorBanner: {
    marginHorizontal: 18,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#fef2f2",
    color: "#b91c1c",
    fontSize: 13,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  emptyWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingVertical: 48,
    minHeight: 280,
  },
  emptyIconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#e8f4f5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: DARK_TEAL,
    textAlign: "center",
    marginBottom: 8,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  emptySub: {
    fontSize: 14,
    color: MUTED,
    textAlign: "center",
    lineHeight: 22,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  skeletonList: {
    paddingTop: 8,
    paddingBottom: 32,
  },
  skeletonCard: {
    marginHorizontal: 18,
    marginBottom: 16,
    borderRadius: 18,
    backgroundColor: "#fff",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e8eef0",
  },
  skeletonImage: {
    height: 168,
    backgroundColor: "#dce8ea",
  },
  skeletonPad: {
    padding: 16,
  },
  padRTL: {
    alignItems: "flex-end",
  },
  skeletonLine: {
    height: 12,
    borderRadius: 6,
    backgroundColor: "#dce8ea",
  },
});
