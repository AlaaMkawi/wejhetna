import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { appAlert } from "../utils/appAlert";
import { View, Text, StyleSheet, Image, TouchableOpacity, StatusBar, Platform, FlatList, useWindowDimensions, ActivityIndicator, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Ionicons from "react-native-vector-icons/Ionicons";
import { RootStackParamList } from "../navigation/types";
import {
  PublicAdvertisement,
  deleteMyAdvertisement,
  deleteAdvertisementAdmin,
} from "../api/advertisements";
import { formatApiImageUri } from "../utils/imageUrl";
import { Colors, Radius, Shadow, Spacing, Typography } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "AdvertisementDetails">;

function sortNewestFirst(list: PublicAdvertisement[]) {
  return [...list].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

function formatPostedAt(iso: string, lang: string): string {
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

export default function AdvertisementDetailsScreen({ route, navigation }: Props) {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.dir() === "rtl";
  const lang = i18n.language || "ar";
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<PublicAdvertisement> | null>(null);

  const [feed, setFeed] = useState<PublicAdvertisement[]>(() =>
    sortNewestFirst(route.params.advertisements)
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [rawId, rawRole] = await Promise.all([
          AsyncStorage.getItem("userId"),
          AsyncStorage.getItem("userRole"),
        ]);
        if (rawId) {
          const n = Number(rawId);
          if (!Number.isNaN(n)) setCurrentUserId(n);
        }
        if (rawRole) setCurrentUserRole(rawRole);
      } catch {
        /* ignore — delete actions will simply remain hidden */
      }
    })();
  }, []);

  const { advertisementId } = route.params;

  const initialIndex = useMemo(() => {
    const idx = feed.findIndex((a) => a.id === advertisementId);
    return Math.max(0, idx);
  }, [feed, advertisementId]);

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex]);

  const pageHeight = height;

  const getItemLayout = useCallback(
    (_data: ArrayLike<PublicAdvertisement> | null | undefined, index: number) => ({
      length: pageHeight,
      offset: pageHeight * index,
      index,
    }),
    [pageHeight]
  );

  useEffect(() => {
    const id = setTimeout(() => {
      try {
        listRef.current?.scrollToIndex({ index: initialIndex, animated: false });
      } catch {
        /* ignore */
      }
    }, 0);
    return () => clearTimeout(id);
  }, [initialIndex]);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
      const first = viewableItems[0];
      if (first && typeof first.index === "number") {
        setCurrentIndex(first.index);
      }
    }
  ).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  const currentItem: PublicAdvertisement | undefined = feed[currentIndex];
  const isOwner =
    !!currentItem && currentUserId != null && currentItem.user_id === currentUserId;
  const isAdmin = currentUserRole === "ADMIN";
  const canDelete = isOwner || isAdmin;

  const performDelete = useCallback(async () => {
    if (!currentItem || !canDelete) return;
    setDeleteBusy(true);
    try {
      if (isOwner && currentUserId != null) {
        await deleteMyAdvertisement({
          userId: currentUserId,
          advertisementId: currentItem.id,
        });
      } else if (isAdmin && currentUserId != null) {
        await deleteAdvertisementAdmin({
          adminUserId: currentUserId,
          advertisementId: currentItem.id,
        });
      } else {
        throw new Error("Missing credentials");
      }
      // Remove deleted ad locally and advance / close if list became empty.
      const removedId = currentItem.id;
      setConfirmOpen(false);
      setFeed((prev) => {
        const next = prev.filter((a) => a.id !== removedId);
        if (next.length === 0) {
          setTimeout(() => navigation.goBack(), 0);
        }
        return next;
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      appAlert(t("error"), t("advertisements.delete.failed", { message: msg }));
    } finally {
      setDeleteBusy(false);
    }
  }, [
    canDelete,
    currentItem,
    currentUserId,
    isAdmin,
    isOwner,
    navigation,
    t,
  ]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <FlatList<PublicAdvertisement>
        ref={(r) => {
          listRef.current = r;
        }}
        data={feed}
        keyExtractor={(it) => String(it.id)}
        renderItem={({ item }) => {
          const uri = formatApiImageUri(item.image_url);
          const posted = formatPostedAt(item.created_at, lang);
          return (
            <View style={{ width, height: pageHeight, backgroundColor: "#000" }}>
              {uri ? (
                <Image
                  source={{ uri }}
                  style={StyleSheet.absoluteFill}
                  resizeMode="contain"
                  accessibilityLabel={t("advertisements.imageAlt")}
                />
              ) : (
                <View style={[StyleSheet.absoluteFill, styles.placeholder]}>
                  <Ionicons name="image-outline" size={56} color="#94a3b8" />
                </View>
              )}
              <View
                style={[
                  styles.datePill,
                  { top: insets.top + 52 },
                ]}
                pointerEvents="none"
              >
                <Ionicons
                  name="time-outline"
                  size={12}
                  color="rgba(255,255,255,0.92)"
                />
                <Text
                  style={[styles.datePillText, isRTL && styles.dateOverlayRTL]}
                  numberOfLines={1}
                >
                  {posted}
                </Text>
              </View>
            </View>
          );
        }}
        pagingEnabled
        snapToInterval={pageHeight}
        snapToAlignment="start"
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        getItemLayout={getItemLayout}
        initialScrollIndex={feed.length > 0 ? initialIndex : undefined}
        removeClippedSubviews={false}
        onScrollToIndexFailed={(info) => {
          setTimeout(() => {
            listRef.current?.scrollToIndex({
              index: info.index,
              animated: false,
            });
          }, 350);
        }}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
      />

      <TouchableOpacity
        style={[
          styles.backFloating,
          isRTL ? { right: 6 } : { left: 6 },
          { top: insets.top + 4 },
        ]}
        onPress={() => navigation.goBack()}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityRole="button"
        accessibilityLabel={t("back")}
      >
        <View style={styles.backInner}>
          <Ionicons
            name={isRTL ? "chevron-forward" : "chevron-back"}
            size={26}
            color="#fff"
          />
        </View>
      </TouchableOpacity>

      {canDelete ? (
        <TouchableOpacity
          style={[
            styles.deleteFloating,
            isRTL ? { left: 6 } : { right: 6 },
            { top: insets.top + 4 },
          ]}
          onPress={() => setConfirmOpen(true)}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel={
            isOwner
              ? t("advertisements.delete.ownerAction")
              : t("advertisements.delete.adminAction")
          }
          disabled={deleteBusy}
        >
          <View style={[styles.backInner, styles.deleteInner]}>
            <Ionicons name="trash-outline" size={22} color="#fff" />
          </View>
        </TouchableOpacity>
      ) : null}

      <Modal
        visible={confirmOpen}
        transparent
        animationType="fade"
        onRequestClose={() => (!deleteBusy ? setConfirmOpen(false) : undefined)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconWrap}>
              <Ionicons
                name="trash-outline"
                size={26}
                color={Colors.danger}
              />
            </View>
            <Text style={[styles.modalTitle, isRTL && styles.modalTextRTL]}>
              {isOwner
                ? t("advertisements.delete.confirmOwnerTitle")
                : t("advertisements.delete.confirmAdminTitle")}
            </Text>
            <Text style={[styles.modalBody, isRTL && styles.modalTextRTL]}>
              {isOwner
                ? t("advertisements.delete.confirmOwnerMessage")
                : t("advertisements.delete.confirmAdminMessage")}
            </Text>
            <View style={[styles.modalActions, isRTL && styles.modalActionsRTL]}>
              <TouchableOpacity
                style={styles.modalBtnGhost}
                onPress={() => (!deleteBusy ? setConfirmOpen(false) : undefined)}
                disabled={deleteBusy}
                activeOpacity={0.85}
              >
                <Text style={styles.modalBtnGhostText}>{t("cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtnDanger, deleteBusy && styles.modalBtnDangerBusy]}
                onPress={performDelete}
                disabled={deleteBusy}
                activeOpacity={0.9}
              >
                {deleteBusy ? (
                  <ActivityIndicator color={Colors.textInverse} />
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f172a",
  },
  /* Pill-shaped posted-at overlay (centered near the top of each page). */
  datePill: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs + 2,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: "rgba(15,23,42,0.45)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    maxWidth: "80%",
  },
  datePillText: {
    fontSize: Typography.sizeXs,
    fontWeight: Typography.weightSemibold,
    color: "rgba(255,255,255,0.94)",
    letterSpacing: 0.2,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  dateOverlayRTL: {
    writingDirection: "rtl",
  },
  /* Floating action buttons (back / delete) layered over the image feed. */
  backFloating: { position: "absolute", zIndex: 20 },
  deleteFloating: { position: "absolute", zIndex: 20 },
  backInner: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(15,23,42,0.45)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  deleteInner: {
    backgroundColor: "rgba(185, 28, 28, 0.78)",
    borderColor: "rgba(255,255,255,0.18)",
  },
  /* Soft confirmation modal — matches the profile/posters design language. */
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xxl,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.lg,
    alignItems: "center",
    ...Shadow.float,
  },
  modalIconWrap: {
    width: 56,
    height: 56,
    borderRadius: Radius.pill,
    backgroundColor: Colors.dangerSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  modalTitle: {
    fontSize: Typography.sizeLg,
    fontWeight: Typography.weightHeavy,
    color: Colors.text,
    marginBottom: Spacing.sm,
    textAlign: "center",
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  modalBody: {
    fontSize: Typography.sizeBase,
    lineHeight: Typography.lineBody + 2,
    color: Colors.textSecondary,
    marginBottom: Spacing.xl,
    textAlign: "center",
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  modalTextRTL: {
    writingDirection: "rtl",
  },
  modalActions: {
    flexDirection: "row",
    alignSelf: "stretch",
    gap: Spacing.sm,
  },
  modalActionsRTL: { flexDirection: "row-reverse" },
  modalBtnGhost: {
    flex: 1,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBtnGhostText: {
    fontSize: Typography.sizeBase,
    fontWeight: Typography.weightSemibold,
    color: Colors.textSecondary,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  modalBtnDanger: {
    flex: 1,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    backgroundColor: Colors.danger,
    alignItems: "center",
    justifyContent: "center",
    ...Shadow.soft,
  },
  modalBtnDangerBusy: {
    opacity: 0.85,
  },
  modalBtnDangerText: {
    color: Colors.textInverse,
    fontSize: Typography.sizeBase,
    fontWeight: Typography.weightBold,
    letterSpacing: 0.2,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
});
