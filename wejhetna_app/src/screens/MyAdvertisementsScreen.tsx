/**
 * Owner-facing "My advertisements" screen: lists the signed-in user's posters
 * across every status (pending / approved / rejected / expired) and lets them
 * delete their own poster — useful both to withdraw a pending request and to
 * take down a published poster early (before its 7-day window ends).
 */
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  RefreshControl,
  Alert,
  Modal,
  Platform,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import Ionicons from "react-native-vector-icons/Ionicons";
import { RootStackParamList } from "../navigation/types";
import {
  fetchMyAdvertisements,
  deleteMyAdvertisement,
  MyAdvertisement,
  AdvertisementStatus,
} from "../api/advertisements";
import { formatApiImageUri } from "../utils/imageUrl";

const DARK_TEAL = "#0f5b63";
const BG = "#f4fbfb";
const CARD = "#ffffff";
const MUTED = "#64748b";
const BORDER = "#e2e8f0";

type Props = NativeStackScreenProps<RootStackParamList, "MyAdvertisements">;

function formatDate(iso: string, lang: string): string {
  try {
    const d = new Date(iso);
    const loc = lang === "he" ? "he-IL" : "ar";
    return d.toLocaleString(loc, {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function isExpired(ad: MyAdvertisement): boolean {
  if (ad.status !== "APPROVED" || !ad.expires_at) return false;
  const ts = new Date(ad.expires_at).getTime();
  return Number.isFinite(ts) && ts <= Date.now();
}

function daysLeft(ad: MyAdvertisement): number | null {
  if (ad.status !== "APPROVED" || !ad.expires_at) return null;
  const ts = new Date(ad.expires_at).getTime();
  if (!Number.isFinite(ts)) return null;
  const diffMs = ts - Date.now();
  if (diffMs <= 0) return 0;
  return Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

type StatusKey = AdvertisementStatus | "EXPIRED";

function deriveStatusKey(ad: MyAdvertisement): StatusKey {
  if (isExpired(ad)) return "EXPIRED";
  return ad.status;
}

function statusChipColors(key: StatusKey): {
  bg: string;
  border: string;
  text: string;
} {
  switch (key) {
    case "PENDING":
      return { bg: "#fff7ed", border: "#fed7aa", text: "#c2410c" };
    case "APPROVED":
      return { bg: "#ecfdf5", border: "#a7f3d0", text: "#047857" };
    case "REJECTED":
      return { bg: "#fef2f2", border: "#fecaca", text: "#b91c1c" };
    case "EXPIRED":
    default:
      return { bg: "#f1f5f9", border: "#cbd5f5", text: "#475569" };
  }
}

export default function MyAdvertisementsScreen({ route, navigation }: Props) {
  const { t, i18n } = useTranslation();
  const { userId } = route.params;
  const lang = i18n.language || "ar";
  const isRTL = i18n.dir() === "rtl";

  const [items, setItems] = useState<MyAdvertisement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedOnce = useRef(false);

  const [pendingDelete, setPendingDelete] = useState<MyAdvertisement | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const loadList = useCallback(async () => {
    setError(null);
    try {
      const list = await fetchMyAdvertisements({ userId });
      setItems(list);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setItems([]);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const first = !hasLoadedOnce.current;
        if (first) setLoading(true);
        try {
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
    }, [loadList])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadList();
    setRefreshing(false);
  }, [loadList]);

  const runDelete = useCallback(async () => {
    if (!pendingDelete) return;
    setDeleteBusy(true);
    try {
      await deleteMyAdvertisement({
        userId,
        advertisementId: pendingDelete.id,
      });
      setItems((prev) => prev.filter((x) => x.id !== pendingDelete.id));
      setPendingDelete(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert(t("error"), t("advertisements.delete.failed", { message: msg }));
    } finally {
      setDeleteBusy(false);
    }
  }, [pendingDelete, t, userId]);

  const sorted = useMemo(() => {
    const copy = [...items];
    copy.sort((a, b) => {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return copy;
  }, [items]);

  const renderItem = useCallback(
    ({ item }: { item: MyAdvertisement }) => {
      const uri = formatApiImageUri(item.image_url);
      const sKey = deriveStatusKey(item);
      const chip = statusChipColors(sKey);
      const statusLabelKey =
        sKey === "PENDING"
          ? "advertisements.myAds.statusPending"
          : sKey === "APPROVED"
            ? "advertisements.myAds.statusApproved"
            : sKey === "REJECTED"
              ? "advertisements.myAds.statusRejected"
              : "advertisements.myAds.statusExpired";
      const remaining = daysLeft(item);
      return (
        <View style={styles.card}>
          <View style={styles.cardMediaWrap}>
            {uri ? (
              <Image
                source={{ uri }}
                style={styles.cardMedia}
                resizeMode="cover"
                accessibilityLabel={t("advertisements.imageAlt")}
              />
            ) : (
              <View style={[styles.cardMedia, styles.cardMediaFallback]}>
                <Ionicons name="image-outline" size={36} color={MUTED} />
              </View>
            )}
          </View>

          <View style={styles.cardBody}>
            <View
              style={[
                styles.statusChip,
                {
                  backgroundColor: chip.bg,
                  borderColor: chip.border,
                  alignSelf: isRTL ? "flex-end" : "flex-start",
                },
              ]}
            >
              <Text style={[styles.statusChipText, { color: chip.text }]}>
                {t(statusLabelKey)}
              </Text>
            </View>

            <Text style={[styles.metaLine, isRTL && styles.textRTL]}>
              {t("advertisements.myAds.submittedAt", {
                value: formatDate(item.created_at, lang),
              })}
            </Text>

            {sKey === "APPROVED" && item.approved_at ? (
              <Text style={[styles.metaLine, isRTL && styles.textRTL]}>
                {t("advertisements.myAds.publishedAt", {
                  value: formatDate(item.approved_at, lang),
                })}
              </Text>
            ) : null}

            {sKey === "APPROVED" && remaining !== null ? (
              <Text style={[styles.metaHighlight, isRTL && styles.textRTL]}>
                {remaining === 0
                  ? t("advertisements.myAds.expiringToday")
                  : t("advertisements.myAds.daysLeft", { count: remaining })}
              </Text>
            ) : null}

            {sKey === "EXPIRED" && item.expires_at ? (
              <Text style={[styles.metaLine, isRTL && styles.textRTL]}>
                {t("advertisements.myAds.expiredAt", {
                  value: formatDate(item.expires_at, lang),
                })}
              </Text>
            ) : null}

            <TouchableOpacity
              style={[styles.deleteBtn, isRTL && styles.rowRTL]}
              activeOpacity={0.85}
              onPress={() => setPendingDelete(item)}
              accessibilityRole="button"
              accessibilityLabel={t("advertisements.myAds.deleteAction")}
            >
              <Ionicons name="trash-outline" size={18} color="#b91c1c" />
              <Text style={styles.deleteBtnText}>
                {t("advertisements.myAds.deleteAction")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    },
    [isRTL, lang, t]
  );

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
            <Ionicons
              name={isRTL ? "chevron-forward" : "chevron-back"}
              size={26}
              color={DARK_TEAL}
            />
          </TouchableOpacity>
          <Text style={[styles.screenTitle, isRTL && styles.textRTL]} numberOfLines={1}>
            {t("advertisements.myAds.title")}
          </Text>
          <View style={styles.backBtnPlaceholder} />
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={DARK_TEAL} />
          <Text style={styles.muted}>{t("advertisements.loading")}</Text>
        </View>
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
          <Ionicons
            name={isRTL ? "chevron-forward" : "chevron-back"}
            size={26}
            color={DARK_TEAL}
          />
        </TouchableOpacity>
        <Text style={[styles.screenTitle, isRTL && styles.textRTL]} numberOfLines={1}>
          {t("advertisements.myAds.title")}
        </Text>
        <View style={styles.backBtnPlaceholder} />
      </View>

      <FlatList
        data={sorted}
        keyExtractor={(it) => String(it.id)}
        renderItem={renderItem}
        contentContainerStyle={
          sorted.length === 0 ? styles.emptyGrow : styles.listContent
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={DARK_TEAL}
          />
        }
        ListHeaderComponent={
          error ? (
            <Text style={[styles.errorBanner, isRTL && styles.textRTL]}>{error}</Text>
          ) : null
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="megaphone-outline" size={44} color={DARK_TEAL} />
              </View>
              <Text style={[styles.emptyTitle, isRTL && styles.textRTL]}>
                {t("advertisements.myAds.emptyTitle")}
              </Text>
              <Text style={[styles.emptySub, isRTL && styles.textRTL]}>
                {t("advertisements.myAds.emptyHint")}
              </Text>
            </View>
          ) : null
        }
      />

      <Modal
        visible={pendingDelete != null}
        transparent
        animationType="fade"
        onRequestClose={() => !deleteBusy && setPendingDelete(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={[styles.modalTitle, isRTL && styles.textRTL]}>
              {t("advertisements.delete.confirmOwnerTitle")}
            </Text>
            <Text style={[styles.modalBody, isRTL && styles.textRTL]}>
              {t("advertisements.delete.confirmOwnerMessage")}
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalBtnGhost}
                disabled={deleteBusy}
                onPress={() => !deleteBusy && setPendingDelete(null)}
              >
                <Text style={styles.modalBtnGhostText}>{t("cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalBtnDanger}
                disabled={deleteBusy}
                onPress={runDelete}
              >
                {deleteBusy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalBtnDangerText}>
                    {t("advertisements.delete.confirmCta")}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 8,
    backgroundColor: BG,
  },
  topBarRTL: { flexDirection: "row-reverse" },
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
  textRTL: { textAlign: "right", writingDirection: "rtl" },
  rowRTL: { flexDirection: "row-reverse" },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  muted: { marginTop: 10, color: MUTED, fontSize: 15 },
  listContent: { paddingBottom: 32, paddingTop: 6 },
  emptyGrow: { flexGrow: 1, paddingBottom: 32 },
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
  card: {
    marginHorizontal: 18,
    marginBottom: 14,
    backgroundColor: CARD,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: BORDER,
    shadowColor: DARK_TEAL,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 2,
  },
  cardMediaWrap: {
    width: "100%",
    height: 148,
    backgroundColor: "#e8f4f5",
  },
  cardMedia: {
    width: "100%",
    height: "100%",
  },
  cardMediaFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: {
    padding: 14,
    gap: 6,
  },
  statusChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 4,
  },
  statusChipText: {
    fontSize: 12,
    fontWeight: "700",
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  metaLine: {
    fontSize: 12,
    color: MUTED,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  metaHighlight: {
    fontSize: 13,
    fontWeight: "700",
    color: DARK_TEAL,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  deleteBtn: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  deleteBtnText: {
    color: "#b91c1c",
    fontSize: 13,
    fontWeight: "700",
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  emptyWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingVertical: 60,
    minHeight: 320,
  },
  emptyIconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#e8f4f5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: BORDER,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: DARK_TEAL,
    marginBottom: 10,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  modalBody: {
    fontSize: 15,
    lineHeight: 22,
    color: "#475569",
    marginBottom: 20,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
  },
  modalBtnGhost: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
  },
  modalBtnGhostText: {
    fontSize: 16,
    fontWeight: "600",
    color: MUTED,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  modalBtnDanger: {
    minWidth: 120,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: "#b91c1c",
    alignItems: "center",
    justifyContent: "center",
  },
  modalBtnDangerText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
});
