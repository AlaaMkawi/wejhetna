/**
 * Public list of approved advertisements (GET /advertisements).
 *
 * Pure design refresh: hero header, soft search bar, quick category chips
 * and a 2-column poster grid that shares the same visual language as the
 * profile screens (theme tokens, soft cards, neutral surfaces).
 *
 * No backend / loading / filtering / approval logic is altered here.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { appAlert } from "../utils/appAlert";
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, RefreshControl, Modal, TextInput, ScrollView, AppState, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Ionicons from "react-native-vector-icons/Ionicons";
import { RootStackParamList } from "../navigation/types";
import {
  fetchPublicAdvertisements,
  PublicAdvertisement,
} from "../api/advertisements";
import { fetchCities, fetchCategories, City, Category } from "../api/places";
import AdvertisementCard from "../components/AdvertisementCard";
import { Colors, Radius, Shadow, Spacing, Typography } from "../theme";
import { useListBottomPad } from "../theme/safeArea";

/**
 * Silent background refresh cadence for the public posters list.
 *
 * Picks up server-side removals (owner delete, admin delete, auto-expiry)
 * for users who keep the screen open, without any visible loading state.
 */
const POSTERS_BACKGROUND_REFRESH_MS = 20000;

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

/** Side padding on the screen content (mirrors `listContent.paddingHorizontal`). */
const SCREEN_HORIZONTAL_PADDING = 16;
/** Gap between columns in the grid (matches `columnWrap.gap`). */
const GRID_GAP = 12;

export default function AdvertisementsScreen() {
  const { t, i18n } = useTranslation();
  const listBottomPad = useListBottomPad(120);
  const navigation = useNavigation<Nav>();
  const isRTL = i18n.dir() === "rtl";
  const lang = i18n.language || "ar";
  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = Math.floor(
    (windowWidth - SCREEN_HORIZONTAL_PADDING * 2 - GRID_GAP) / 2
  );

  const [items, setItems] = useState<PublicAdvertisement[]>([]);
  const [listBusy, setListBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [cities, setCities] = useState<City[]>([]);
  /** All categories (for id resolution + map labels); chips use active subset only. */
  const [categories, setCategories] = useState<Category[]>([]);
  const [cityFilter, setCityFilter] = useState<number | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<number | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  /** Local-only text filter — does not change any network request. */
  const [searchQuery, setSearchQuery] = useState("");

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
        appAlert(t("error"), t("advertisements.loadFailedMeta"));
      }
    })();
    return () => {
      alive = false;
    };
  }, [t]);

  const activeCategories = useMemo(
    () => categories.filter((c) => c.is_active !== false),
    [categories]
  );

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

  /** Avoid listing the same row twice: the synthetic "Other" / "Online" chips already map to these IDs. */
  const activeCategoriesForUi = useMemo(
    () => activeCategories.filter((c) => OTHER_CATEGORY_ID == null || c.id !== OTHER_CATEGORY_ID),
    [activeCategories, OTHER_CATEGORY_ID]
  );
  const citiesForFilterUi = useMemo(
    () => cities.filter((c) => ONLINE_CITY_ID == null || c.id !== ONLINE_CITY_ID),
    [cities, ONLINE_CITY_ID]
  );

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
        appAlert(t("error"), t("advertisements.loadFailed"));
      } finally {
        if (alive) setListBusy(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [resolvedCityFilter, resolvedCategoryFilter, t]);

  // Keep the latest resolved filters in a ref so the background refresh
  // always fetches against the current filter selection without having to
  // tear down and rebuild the polling timer on every filter change.
  const filtersRef = useRef({
    cityId: resolvedCityFilter,
    categoryId: resolvedCategoryFilter,
  });
  useEffect(() => {
    filtersRef.current = {
      cityId: resolvedCityFilter,
      categoryId: resolvedCategoryFilter,
    };
  }, [resolvedCityFilter, resolvedCategoryFilter]);

  /**
   * Quiet background refresh: no spinners, no alerts, and stale responses
   * (i.e. filters changed mid-flight) are discarded so we never flash old
   * data back onto the screen.
   */
  const silentRefresh = useCallback(async () => {
    const { cityId, categoryId } = filtersRef.current;
    try {
      const list = await fetchPublicAdvertisements({
        cityId: cityId ?? undefined,
        categoryId: categoryId ?? undefined,
      });
      const latest = filtersRef.current;
      if (latest.cityId !== cityId || latest.categoryId !== categoryId) return;
      setItems(sortAdvertisementsNewestFirst(list));
    } catch {
      // Intentionally swallowed: keep showing last-known list instead of
      // surfacing transient network errors during background polling.
    }
  }, []);

  // While the posters screen is focused, keep the list fresh in the
  // background so deletions (by owner / admin) and auto-expirations
  // disappear for other viewers without requiring a manual refresh.
  useFocusEffect(
    useCallback(() => {
      void silentRefresh();
      const intervalId = setInterval(() => {
        void silentRefresh();
      }, POSTERS_BACKGROUND_REFRESH_MS);

      const appStateSub = AppState.addEventListener("change", (state) => {
        if (state === "active") void silentRefresh();
      });

      return () => {
        clearInterval(intervalId);
        appStateSub.remove();
      };
    }, [silentRefresh])
  );

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
      appAlert(t("error"), t("advertisements.loadFailed"));
    } finally {
      setRefreshing(false);
    }
  }, [resolvedCityFilter, resolvedCategoryFilter, t]);

  const cityMap = useMemo(() => {
    const m = new Map<number, City>();
    cities.forEach((c) => m.set(c.id, c));
    return m;
  }, [cities]);
  const categoryMap = useMemo(() => {
    const m = new Map<number, Category>();
    categories.forEach((c) => m.set(c.id, c));
    return m;
  }, [categories]);

  /**
   * Local search: pure UI filter on the already-fetched, server-filtered list.
   * Matches against description, author name and the resolved category/city
   * labels so the search input feels responsive without extra requests.
   */
  const visibleItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => {
      const cat = categoryMap.get(it.category_id);
      const city = cityMap.get(it.city_id);
      const haystack = [
        it.description ?? "",
        it.user?.full_name ?? "",
        it.user?.username ?? "",
        cat ? labelCategory(cat, lang) : "",
        city ? labelCity(city, lang) : "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [items, searchQuery, categoryMap, cityMap, lang]);

  const hasActiveFilters =
    categoryFilter != null || cityFilter != null || searchQuery.trim().length > 0;

  const renderItem = useCallback(
    ({ item }: { item: PublicAdvertisement }) => {
      const c = categoryMap.get(item.category_id);
      const city = cityMap.get(item.city_id);
      return (
        <AdvertisementCard
          item={item}
          width={cardWidth}
          categoryLabel={c ? labelCategory(c, lang) : undefined}
          cityLabel={city ? labelCity(city, lang) : undefined}
          onPress={() =>
            navigation.navigate("AdvertisementDetails", {
              advertisementId: item.id,
              advertisements: items,
            })
          }
        />
      );
    },
    [cardWidth, categoryMap, cityMap, items, lang, navigation]
  );

  /** Quick-pick category strip mounted right under the search bar. */
  const renderCategoryChips = () => {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
        // Mirror chip order under RTL so "All" stays at the start.
        style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}
      >
        <View style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}>
          <Chip
            label={t("advertisements.allCategories")}
            active={categoryFilter == null}
            onPress={() => setCategoryFilter(null)}
          />
        </View>
        {activeCategoriesForUi.map((c) => (
          <View
            key={`chip-${c.id}`}
            style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}
          >
            <Chip
              label={labelCategory(c, lang)}
              active={categoryFilter === c.id}
              onPress={() => setCategoryFilter(c.id)}
            />
          </View>
        ))}
        {OTHER_CATEGORY_ID != null ? (
          <View style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}>
            <Chip
              label={t("advertisements.otherOption")}
              active={categoryFilter === -1}
              onPress={() => setCategoryFilter(-1)}
            />
          </View>
        ) : null}
      </ScrollView>
    );
  };

  if (listBusy && items.length === 0) {
    return (
      <SafeAreaView style={styles.centered} edges={["top", "left", "right"]}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>{t("advertisements.loading")}</Text>
      </SafeAreaView>
    );
  }

  const ListHeader = (
    <View style={styles.listHeaderWrap}>
      {/* Hero */}
      <View style={styles.hero}>
        <View style={[styles.heroRow, isRTL && styles.rowRTL]}>
          <View style={styles.heroTextWrap}>
            <Text style={[styles.heroEyebrow, isRTL && styles.textRTL]}>
              {t("advertisements.heroEyebrow")}
            </Text>
            <Text style={[styles.heroTitle, isRTL && styles.textRTL]}>
              {t("advertisements.listTitle")}
            </Text>
            <Text
              style={[styles.heroDescription, isRTL && styles.textRTL]}
              numberOfLines={3}
            >
              {t("advertisements.heroDescription")}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.heroCta, isRTL && styles.rowRTL]}
          activeOpacity={0.9}
          onPress={() => navigation.navigate("CreateAdvertisement")}
          accessibilityRole="button"
          accessibilityLabel={t("advertisements.submitCta")}
        >
          <Ionicons
            name="add-circle-outline"
            size={18}
            color={Colors.textInverse}
          />
          <Text style={styles.heroCtaText}>{t("advertisements.submitCta")}</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={[styles.searchWrap, isRTL && styles.rowRTL]}>
        <Ionicons
          name="search-outline"
          size={18}
          color={Colors.textMuted}
          style={isRTL ? styles.searchIconRTL : styles.searchIcon}
        />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={t("advertisements.searchPlaceholder")}
          placeholderTextColor={Colors.textMuted}
          style={[styles.searchInput, isRTL && styles.textRTL]}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {searchQuery.length > 0 ? (
          <TouchableOpacity
            onPress={() => setSearchQuery("")}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={t("advertisements.clearFilters")}
          >
            <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Filter row: quick category chips + a "more filters" pill that opens
          the existing filter modal (city + categories advanced view). */}
      <View style={[styles.filterRow, isRTL && styles.rowRTL]}>
        <View style={styles.chipsScrollWrap}>{renderCategoryChips()}</View>
        <TouchableOpacity
          style={[
            styles.moreFiltersBtn,
            (cityFilter != null) && styles.moreFiltersBtnActive,
          ]}
          activeOpacity={0.85}
          onPress={() => setFiltersOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t("advertisements.moreFilters")}
        >
          <Ionicons
            name="options-outline"
            size={16}
            color={cityFilter != null ? Colors.textInverse : Colors.primary}
          />
        </TouchableOpacity>
      </View>

      {/* Result summary line */}
      <View style={[styles.summaryRow, isRTL && styles.rowRTL]}>
        <Text style={[styles.summaryCount, isRTL && styles.textRTL]}>
          {t("advertisements.resultCount", { count: visibleItems.length })}
        </Text>
        {hasActiveFilters ? (
          <TouchableOpacity
            onPress={() => {
              setCityFilter(null);
              setCategoryFilter(null);
              setSearchQuery("");
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.summaryClear}>
              {t("advertisements.clearFilters")}
            </Text>
          </TouchableOpacity>
        ) : (
          <Text style={[styles.summaryHint, isRTL && styles.textRTL]}>
            {t("advertisements.tapToView")}
          </Text>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <FlatList
        data={visibleItems}
        keyExtractor={(it) => String(it.id)}
        renderItem={renderItem}
        numColumns={2}
        columnWrapperStyle={styles.columnWrap}
        contentContainerStyle={[styles.listContent, { paddingBottom: listBottomPad }]}
        ListHeaderComponent={ListHeader}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
        ListEmptyComponent={
          !listBusy ? (
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="search" size={20} color={Colors.primary} />
              </View>
              <Text style={[styles.emptyTitle, isRTL && styles.textRTL]}>
                {hasActiveFilters
                  ? t("advertisements.noResultsTitle")
                  : t("advertisements.noData")}
              </Text>
              {hasActiveFilters ? (
                <Text style={[styles.emptyHint, isRTL && styles.textRTL]}>
                  {t("advertisements.noResultsHint")}
                </Text>
              ) : null}
            </View>
          ) : null
        }
        ListFooterComponent={
          listBusy && items.length > 0 ? (
            <View style={styles.inlineBusy}>
              <ActivityIndicator color={Colors.primary} />
            </View>
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
              <View style={styles.modalHeaderText}>
                <Text style={[styles.modalTitle, isRTL && styles.textRTL]}>
                  {t("advertisements.filterHeader")}
                </Text>
                <Text style={[styles.modalSubtitle, isRTL && styles.textRTL]}>
                  {t("advertisements.filterHeaderSubtitle")}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setFiltersOpen(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
              >
                <Ionicons name="close" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <Text style={[styles.modalLabel, isRTL && styles.textRTL]}>
                {t("advertisements.category")}
              </Text>
              <View style={styles.optionWrap}>
                <OptionChip
                  label={t("advertisements.allCategories")}
                  active={categoryFilter == null}
                  onPress={() => applyCategoryFilter(null)}
                />
                {OTHER_CATEGORY_ID != null ? (
                  <OptionChip
                    label={t("advertisements.otherOption")}
                    active={categoryFilter === -1}
                    onPress={() => applyCategoryFilter(-1)}
                  />
                ) : null}
                {activeCategoriesForUi.map((c) => (
                  <OptionChip
                    key={`cat-opt-${c.id}`}
                    label={labelCategory(c, lang)}
                    active={categoryFilter === c.id}
                    onPress={() => applyCategoryFilter(c.id)}
                  />
                ))}
              </View>

              <Text
                style={[
                  styles.modalLabel,
                  styles.modalLabelSpaced,
                  isRTL && styles.textRTL,
                ]}
              >
                {t("advertisements.city")}
              </Text>
              <View style={styles.optionWrap}>
                <OptionChip
                  label={t("advertisements.allCities")}
                  active={cityFilter == null}
                  onPress={() => applyCityFilter(null)}
                />
                {ONLINE_CITY_ID != null ? (
                  <OptionChip
                    label={t("advertisements.onlineBusinessOption")}
                    active={cityFilter === -1}
                    onPress={() => applyCityFilter(-1)}
                  />
                ) : null}
                {citiesForFilterUi.map((c) => (
                  <OptionChip
                    key={`city-opt-${c.id}`}
                    label={labelCity(c, lang)}
                    active={cityFilter === c.id}
                    onPress={() => applyCityFilter(c.id)}
                  />
                ))}
              </View>
            </ScrollView>

            <View style={[styles.modalActions, isRTL && styles.rowRTL]}>
              <TouchableOpacity
                style={styles.modalGhostBtn}
                onPress={clearFiltersAndClose}
                activeOpacity={0.85}
              >
                <Text style={styles.modalGhostBtnText}>
                  {t("advertisements.clearFilters")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalPrimaryBtn}
                onPress={() => setFiltersOpen(false)}
                activeOpacity={0.9}
              >
                <Text style={styles.modalPrimaryBtnText}>
                  {t("advertisements.applyFilters")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* ─────────────────────────── small UI primitives ─────────────────────────── */

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function OptionChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.optionChip, active && styles.optionChipOn]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Text style={[styles.optionChipText, active && styles.optionChipTextOn]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.bg,
  },
  loadingText: {
    marginTop: Spacing.md,
    color: Colors.textSecondary,
    fontSize: Typography.sizeBase,
  },
  rowRTL: { flexDirection: "row-reverse" },
  textRTL: { textAlign: "right", writingDirection: "rtl" },

  /* ─── List structure ─── */
  listContent: {
    paddingHorizontal: SCREEN_HORIZONTAL_PADDING,
    gap: Spacing.md,
  },
  listHeaderWrap: {
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  columnWrap: {
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
    alignItems: "flex-start",
  },
  inlineBusy: { paddingVertical: Spacing.lg, alignItems: "center" },

  /* ─── Hero ─── */
  hero: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xxl,
    paddingHorizontal: Spacing.lg + 2,
    paddingTop: Spacing.lg + 4,
    paddingBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.soft,
    gap: Spacing.lg,
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: Spacing.lg,
  },
  heroTextWrap: { flex: 1, gap: 6 },
  heroEyebrow: {
    fontSize: Typography.sizeXs,
    fontWeight: Typography.weightBold,
    color: Colors.primary,
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  heroTitle: {
    fontSize: Typography.sizeXxl,
    fontWeight: Typography.weightHeavy,
    color: Colors.text,
    lineHeight: Typography.lineTitle + 4,
  },
  heroDescription: {
    fontSize: Typography.sizeBase,
    color: Colors.textSecondary,
    lineHeight: Typography.lineBody + 2,
  },
  heroCta: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm + 4,
    borderRadius: Radius.pill,
    ...Shadow.soft,
  },
  heroCtaText: {
    color: Colors.textInverse,
    fontSize: Typography.sizeBase,
    fontWeight: Typography.weightBold,
    letterSpacing: 0.2,
  },

  /* ─── Search ─── */
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.soft,
    gap: Spacing.sm,
  },
  searchIcon: { marginRight: 0 },
  searchIconRTL: { marginLeft: 0 },
  searchInput: {
    flex: 1,
    fontSize: Typography.sizeBase,
    color: Colors.text,
    paddingVertical: 0,
  },

  /* ─── Filter row (chips + more) ─── */
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  chipsScrollWrap: { flex: 1, overflow: "hidden" },
  chipsRow: {
    paddingVertical: 2,
    gap: Spacing.sm,
  },
  chip: {
    paddingHorizontal: Spacing.md + 2,
    paddingVertical: 7,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: Typography.sizeSm,
    fontWeight: Typography.weightSemibold,
    color: Colors.textSecondary,
  },
  chipTextActive: { color: Colors.textInverse },
  moreFiltersBtn: {
    width: 38,
    height: 38,
    borderRadius: Radius.pill,
    backgroundColor: Colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.primarySoft,
  },
  moreFiltersBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },

  /* ─── Summary line ─── */
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 2,
    paddingTop: 2,
    gap: Spacing.sm,
  },
  summaryCount: {
    fontSize: Typography.sizeSm,
    fontWeight: Typography.weightSemibold,
    color: Colors.textSecondary,
  },
  summaryHint: {
    fontSize: Typography.sizeXs,
    color: Colors.textMuted,
  },
  summaryClear: {
    fontSize: Typography.sizeXs,
    fontWeight: Typography.weightBold,
    color: Colors.primary,
  },

  /* ─── Empty state ─── */
  emptyWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.xxxl,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  emptyIconWrap: {
    width: 48,
    height: 48,
    borderRadius: Radius.pill,
    backgroundColor: Colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  emptyTitle: {
    fontSize: Typography.sizeLg,
    fontWeight: Typography.weightBold,
    color: Colors.text,
    textAlign: "center",
  },
  emptyHint: {
    fontSize: Typography.sizeSm,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: Typography.lineBody,
  },

  /* ─── Filter modal ─── */
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: "center",
    paddingHorizontal: Spacing.lg,
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xxl,
    paddingTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    maxHeight: "85%",
    ...Shadow.float,
  },
  modalCardRTL: { alignItems: "stretch" },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  modalHeaderText: { flex: 1, gap: 2 },
  modalTitle: {
    fontSize: Typography.sizeLg,
    fontWeight: Typography.weightHeavy,
    color: Colors.text,
  },
  modalSubtitle: {
    fontSize: Typography.sizeSm,
    color: Colors.textMuted,
    lineHeight: Typography.lineBody,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  modalScroll: { maxHeight: 420 },
  modalScrollContent: { paddingBottom: Spacing.md },
  modalLabel: {
    fontSize: Typography.sizeXs,
    fontWeight: Typography.weightBold,
    color: Colors.textMuted,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: Spacing.sm,
  },
  modalLabelSpaced: { marginTop: Spacing.lg },
  optionWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  optionChip: {
    paddingVertical: 9,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceMuted,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  optionChipOn: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  optionChipText: {
    fontSize: Typography.sizeSm,
    fontWeight: Typography.weightSemibold,
    color: Colors.textSecondary,
  },
  optionChipTextOn: { color: Colors.textInverse },
  modalActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  modalGhostBtn: {
    paddingVertical: Spacing.sm + 4,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceMuted,
  },
  modalGhostBtnText: {
    fontSize: Typography.sizeBase,
    fontWeight: Typography.weightSemibold,
    color: Colors.textSecondary,
  },
  modalPrimaryBtn: {
    paddingVertical: Spacing.sm + 4,
    paddingHorizontal: Spacing.xl,
    borderRadius: Radius.pill,
    backgroundColor: Colors.primary,
    ...Shadow.soft,
  },
  modalPrimaryBtnText: {
    fontSize: Typography.sizeBase,
    fontWeight: Typography.weightBold,
    color: Colors.textInverse,
    letterSpacing: 0.2,
  },
});
