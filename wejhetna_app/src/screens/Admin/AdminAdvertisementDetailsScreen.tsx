import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Modal,
  ActivityIndicator,
  StatusBar,
  Platform,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import Ionicons from "react-native-vector-icons/Ionicons";
import { RootStackParamList } from "../../navigation/types";
import {
  approveAdvertisementAdmin,
  rejectAdvertisementAdmin,
} from "../../api/advertisements";
import { fetchCities, fetchCategories, City, Category } from "../../api/places";
import { formatApiImageUri } from "../../utils/imageUrl";

const DARK_TEAL = "#0f5b63";
const BG = "#f4fbfb";
const MUTED = "#64748b";
const CARD = "#ffffff";
const BORDER = "#e2e8f0";
const SUCCESS_ICON = "#059669";
const SUCCESS_SOFT = "#ecfdf5";
const SUCCESS_RING = "#a7f3d0";
const WARN_ICON = "#c2410c";
const WARN_SOFT = "#fff7ed";
const WARN_RING = "#fed7aa";
const ERR_ICON = "#dc2626";
const ERR_SOFT = "#fef2f2";
const ERR_RING = "#fecaca";

type FeedbackState =
  | { kind: "approved" }
  | { kind: "rejected" }
  | { kind: "error"; message: string };

const feedbackStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: CARD,
    borderRadius: 24,
    paddingVertical: 28,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: BORDER,
    shadowColor: DARK_TEAL,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
    alignItems: "center",
  },
  cardRTL: {
    alignItems: "stretch",
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 10,
    textAlign: "center",
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    color: "#475569",
    textAlign: "center",
    marginBottom: 28,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  btn: {
    width: "100%",
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  btnSuccess: {
    backgroundColor: DARK_TEAL,
    shadowColor: DARK_TEAL,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 4,
  },
  btnWarning: {
    backgroundColor: "#ea580c",
    shadowColor: "#c2410c",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  btnError: {
    backgroundColor: "#dc2626",
    shadowColor: "#b91c1c",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  btnText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
});

type Props = NativeStackScreenProps<RootStackParamList, "AdminAdvertisementDetails">;

type AdminFeedbackModalProps = {
  variant: "approved" | "rejected" | "error";
  message: string;
  isRTL: boolean;
  onDismiss: () => void;
  allowBackdropDismiss: boolean;
};

function AdminAdvertisementFeedbackModal({
  variant,
  message,
  isRTL,
  onDismiss,
  allowBackdropDismiss,
}: AdminFeedbackModalProps) {
  const { t } = useTranslation();
  const isApproved = variant === "approved";
  const isRejected = variant === "rejected";
  const isError = variant === "error";

  const title = isApproved
    ? t("advertisements.admin.feedbackApprovedTitle")
    : isRejected
      ? t("advertisements.admin.feedbackRejectedTitle")
      : t("advertisements.admin.feedbackErrorTitle");

  const iconName = isApproved ? "checkmark-circle" : isRejected ? "remove-circle" : "alert-circle";
  const iconColor = isApproved ? SUCCESS_ICON : isRejected ? WARN_ICON : ERR_ICON;
  const iconBg = isApproved ? SUCCESS_SOFT : isRejected ? WARN_SOFT : ERR_SOFT;
  const iconRing = isApproved ? SUCCESS_RING : isRejected ? WARN_RING : ERR_RING;
  const btnStyle = isError ? feedbackStyles.btnError : isRejected ? feedbackStyles.btnWarning : feedbackStyles.btnSuccess;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <View style={feedbackStyles.backdrop} accessibilityViewIsModal>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={allowBackdropDismiss ? onDismiss : undefined}
          accessibilityRole="button"
          accessibilityLabel={t("close")}
        />
        <View
          style={[feedbackStyles.card, isRTL && feedbackStyles.cardRTL]}
          onStartShouldSetResponder={() => true}
        >
          <View
            style={[
              feedbackStyles.iconWrap,
              { backgroundColor: iconBg, borderColor: iconRing },
            ]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Ionicons name={iconName} size={40} color={iconColor} />
          </View>
          <Text style={[feedbackStyles.title, isRTL && styles.textRTL]}>{title}</Text>
          <Text style={[feedbackStyles.body, isRTL && styles.textRTL]}>{message}</Text>
          <TouchableOpacity
            style={[feedbackStyles.btn, btnStyle]}
            onPress={onDismiss}
            activeOpacity={0.9}
            accessibilityRole="button"
          >
            <Text style={feedbackStyles.btnText}>
              {t("advertisements.admin.feedbackDismiss") || t("ok")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

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
      dateStyle: "full",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export default function AdminAdvertisementDetailsScreen({ route, navigation }: Props) {
  const { t, i18n } = useTranslation();
  const { adminUserId, advertisement } = route.params;
  const lang = i18n.language || "ar";
  const isRTL = i18n.dir() === "rtl";

  const [cities, setCities] = useState<City[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"approve" | "reject" | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cits, cats] = await Promise.all([fetchCities(), fetchCategories()]);
        if (!cancelled) {
          setCities(cits);
          setCategories(cats);
        }
      } catch {
        /* labels fall back to ids */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const cityLabel = useMemo(() => {
    const c = cities.find((x) => x.id === advertisement.city_id);
    return c ? labelCity(c, lang) : `— ${advertisement.city_id}`;
  }, [cities, advertisement.city_id, lang]);

  const categoryLabel = useMemo(() => {
    const c = categories.find((x) => x.id === advertisement.category_id);
    return c ? labelCategory(c, lang) : `— ${advertisement.category_id}`;
  }, [categories, advertisement.category_id, lang]);

  const imageUri = formatApiImageUri(advertisement.image_url);

  const runAction = useCallback(async () => {
    if (!confirmAction) return;
    setActionLoading(true);
    try {
      if (confirmAction === "approve") {
        await approveAdvertisementAdmin({
          adminUserId,
          advertisementId: advertisement.id,
        });
        setFeedback({ kind: "approved" });
      } else {
        await rejectAdvertisementAdmin({
          adminUserId,
          advertisementId: advertisement.id,
        });
        setFeedback({ kind: "rejected" });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setFeedback({
        kind: "error",
        message: t("advertisements.admin.actionFailed", { message: msg }),
      });
    } finally {
      setActionLoading(false);
      setConfirmVisible(false);
      setConfirmAction(null);
    }
  }, [confirmAction, adminUserId, advertisement.id, t]);

  const dismissFeedback = useCallback(() => {
    if (feedback == null) return;
    const goBack = feedback.kind === "approved" || feedback.kind === "rejected";
    setFeedback(null);
    if (goBack) {
      navigation.goBack();
    }
  }, [feedback, navigation]);

  const openConfirm = (action: "approve" | "reject") => {
    setConfirmAction(action);
    setConfirmVisible(true);
  };

  const desc = advertisement.description?.trim();

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
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
          {t("advertisements.admin.detailsTitle")}
        </Text>
        <View style={styles.backBtnPlaceholder} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              style={styles.heroImage}
              resizeMode="cover"
              accessibilityLabel={t("advertisements.imageAlt")}
            />
          ) : (
            <View style={[styles.heroImage, styles.heroPlaceholder]}>
              <Ionicons name="image-outline" size={56} color={MUTED} />
            </View>
          )}
        </View>

        <View style={[styles.card, isRTL && styles.cardRTL]}>
          <View style={[styles.kvRow, isRTL && styles.rowRTL]}>
            <Text style={[styles.kLabel, isRTL && styles.textRTL]}>{t("advertisements.category")}</Text>
            <Text style={[styles.kValue, isRTL && styles.textRTL]}>{categoryLabel}</Text>
          </View>
          <View style={[styles.kvRow, isRTL && styles.rowRTL]}>
            <Text style={[styles.kLabel, isRTL && styles.textRTL]}>{t("advertisements.city")}</Text>
            <Text style={[styles.kValue, isRTL && styles.textRTL]}>{cityLabel}</Text>
          </View>
          <View style={[styles.kvRow, isRTL && styles.rowRTL]}>
            <Text style={[styles.kLabel, isRTL && styles.textRTL]}>{t("advertisements.admin.statusLabel")}</Text>
            <View style={styles.statusPill}>
              <Text style={styles.statusPillText}>{t("advertisements.admin.statusPending")}</Text>
            </View>
          </View>
          <View style={[styles.kvRow, isRTL && styles.rowRTL]}>
            <Text style={[styles.kLabel, isRTL && styles.textRTL]}>{t("advertisements.admin.userLabel")}</Text>
            <Text style={[styles.kValue, isRTL && styles.textRTL]}>
              {advertisement.user.full_name} (@{advertisement.user.username})
            </Text>
          </View>
          <View style={[styles.kvRow, isRTL && styles.rowRTL]}>
            <Text style={[styles.kLabel, isRTL && styles.textRTL]}>{t("advertisements.admin.createdAtLabel")}</Text>
            <Text style={[styles.kValue, isRTL && styles.textRTL]}>
              {formatCreatedAt(advertisement.created_at, lang)}
            </Text>
          </View>

          <View style={styles.descBlock}>
            <Text style={[styles.kLabel, isRTL && styles.textRTL]}>{t("advertisements.description")}</Text>
            <Text style={[styles.descriptionBody, isRTL && styles.textRTL]}>
              {desc || t("advertisements.admin.noDescription")}
            </Text>
          </View>
        </View>

        <View style={[styles.actions, isRTL && styles.actionsRTL]}>
          <TouchableOpacity
            style={[styles.btn, styles.btnReject]}
            onPress={() => openConfirm("reject")}
            disabled={actionLoading}
            activeOpacity={0.88}
          >
            <Ionicons name="close-circle-outline" size={22} color="#b91c1c" />
            <Text style={styles.btnRejectText}>{t("advertisements.admin.reject")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.btnApprove]}
            onPress={() => openConfirm("approve")}
            disabled={actionLoading}
            activeOpacity={0.88}
          >
            <Ionicons name="checkmark-circle-outline" size={22} color="#fff" />
            <Text style={styles.btnApproveText}>{t("advertisements.admin.approve")}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal
        visible={confirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !actionLoading && setConfirmVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, isRTL && styles.cardRTL]}>
            <Text style={[styles.modalTitle, isRTL && styles.textRTL]}>
              {confirmAction === "approve"
                ? t("advertisements.admin.confirmApproveTitle")
                : t("advertisements.admin.confirmRejectTitle")}
            </Text>
            <Text style={[styles.modalBody, isRTL && styles.textRTL]}>
              {confirmAction === "approve"
                ? t("advertisements.admin.confirmApproveMessage")
                : t("advertisements.admin.confirmRejectMessage")}
            </Text>
            <View style={[styles.modalActions, isRTL && styles.actionsRTL]}>
              <TouchableOpacity
                style={styles.modalBtnGhost}
                onPress={() => !actionLoading && setConfirmVisible(false)}
                disabled={actionLoading}
              >
                <Text style={styles.modalBtnGhostText}>{t("cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={
                  confirmAction === "approve" ? styles.modalBtnPrimary : styles.modalBtnDanger
                }
                onPress={runAction}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalBtnPrimaryText}>
                    {confirmAction === "approve"
                      ? t("advertisements.admin.approve")
                      : t("advertisements.admin.reject")}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {feedback != null && (
        <AdminAdvertisementFeedbackModal
          variant={
            feedback.kind === "error" ? "error" : feedback.kind === "approved" ? "approved" : "rejected"
          }
          message={
            feedback.kind === "error"
              ? feedback.message
              : feedback.kind === "approved"
                ? t("advertisements.admin.approvedSuccess")
                : t("advertisements.admin.rejectedSuccess")
          }
          isRTL={isRTL}
          onDismiss={dismissFeedback}
          allowBackdropDismiss={feedback.kind === "error"}
        />
      )}
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
  scroll: {
    paddingBottom: 28,
  },
  hero: {
    paddingHorizontal: 18,
    paddingTop: 4,
  },
  heroImage: {
    width: "100%",
    height: 260,
    borderRadius: 20,
    backgroundColor: "#eef5f6",
  },
  heroPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    marginHorizontal: 18,
    marginTop: 18,
    backgroundColor: CARD,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: BORDER,
    shadowColor: DARK_TEAL,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 3,
    gap: 14,
  },
  cardRTL: {
    alignItems: "stretch",
  },
  kvRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  rowRTL: {
    flexDirection: "row-reverse",
  },
  kLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: MUTED,
    minWidth: 100,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  kValue: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: "#0f172a",
    textAlign: "right",
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  statusPill: {
    backgroundColor: "#fff7ed",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#fed7aa",
  },
  statusPillText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#c2410c",
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  descBlock: {
    marginTop: 4,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
    gap: 8,
  },
  descriptionBody: {
    fontSize: 15,
    lineHeight: 24,
    color: "#334155",
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    marginHorizontal: 18,
    marginTop: 22,
  },
  actionsRTL: {
    flexDirection: "row-reverse",
  },
  btn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    borderRadius: 16,
  },
  btnApprove: {
    backgroundColor: DARK_TEAL,
    shadowColor: DARK_TEAL,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  btnReject: {
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: "#fecaca",
  },
  btnApproveText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  btnRejectText: {
    color: "#b91c1c",
    fontSize: 16,
    fontWeight: "700",
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: CARD,
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
  modalBtnPrimary: {
    minWidth: 120,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: DARK_TEAL,
    alignItems: "center",
    justifyContent: "center",
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
  modalBtnPrimaryText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
});
