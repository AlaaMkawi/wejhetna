// src/screens/AdminDriverDetailsScreen.tsx

import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Image,
  StatusBar,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";
import i18n from "../../i18n";
import MessageModal from "../MessageModal";
import FullscreenImageViewer from "../../components/FullscreenImageViewer";
import AttachmentPreview from "../../components/driver/AttachmentPreview";
import { isImageAttachmentUrl } from "../../utils/attachmentDisplay";
import Ionicons from "react-native-vector-icons/Ionicons";
import {
  DriverRatingAdmin,
  DriverReportsCountSummary,
  DriverRatingSummary,
  getDriverRatingSummary,
  listDriverRatings,
  adminGetDriverReportsSummaryForDriver,
} from "../../api/rides";

import { API_BASE_URL } from "../../../config";
const DARK_TEAL = "#0f5b63";

type Props = NativeStackScreenProps<RootStackParamList, "AdminDriverDetails">;

export default function AdminDriverDetailsScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const { adminUserId, role, driver } = route.params;
  const [tab, setTab] = useState<"personal" | "vehicle" | "feedback">("personal");

  // ---- Feedback tab data (ratings + reports summary) ----
  const initialRatingAvg =
    typeof (driver as { rating_avg?: number | null }).rating_avg === "number"
      ? (driver as { rating_avg: number }).rating_avg
      : null;
  const initialRatingCount =
    typeof (driver as { rating_count?: number | null }).rating_count === "number"
      ? (driver as { rating_count: number }).rating_count
      : null;

  const [ratingSummary, setRatingSummary] = useState<DriverRatingSummary>({
    driver_user_id: driver.user_id,
    rating_avg: initialRatingAvg ?? 0,
    rating_count: initialRatingCount ?? 0,
  });
  const [ratings, setRatings] = useState<DriverRatingAdmin[]>([]);
  const [reportsSummary, setReportsSummary] = useState<DriverReportsCountSummary | null>(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  const loadFeedback = React.useCallback(async () => {
    setFeedbackLoading(true);
    setFeedbackError(null);
    try {
      // Run in parallel — three independent GETs backing a single tab.
      const [summary, ratingsList, reports] = await Promise.all([
        getDriverRatingSummary(driver.user_id),
        listDriverRatings(driver.user_id, 100),
        adminGetDriverReportsSummaryForDriver(driver.user_id),
      ]);
      setRatingSummary(summary);
      setRatings(ratingsList);
      setReportsSummary(reports);
    } catch (e: any) {
      setFeedbackError(e?.message ?? t("network_error") ?? "Network error");
    } finally {
      setFeedbackLoading(false);
    }
  }, [driver.user_id, t]);

  useFocusEffect(
    React.useCallback(() => {
      loadFeedback();
    }, [loadFeedback])
  );
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const openViewer = (images: string[], index: number) => {
    const safe = images.filter((u) => typeof u === "string" && u.trim().length > 0);
    if (safe.length === 0) return;
    setViewerImages(safe);
    setViewerIndex(Math.min(Math.max(index, 0), safe.length - 1));
    setViewerVisible(true);
  };

  const carPhotos = useMemo(() => {
    const urls = driver.car_photos_urls || [];
    return Array.isArray(urls) ? urls.filter((u) => typeof u === "string" && u.trim().length > 0) : [];
  }, [driver.car_photos_urls]);
  
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorModal, setErrorModal] = useState<{ visible: boolean; title: string; message: string }>({
    visible: false,
    title: "",
    message: "",
  });

  const getStatusTranslation = (status: string) => {
    switch (status.toUpperCase()) {
      case "PENDING":
        return t("pending");
      case "APPROVED":
        return t("approved");
      case "REJECTED":
        return t("rejected");
      case "SUBMITTED":
        return t("submitted") || status;
      default:
        return status;
    }
  };

  const handleApprove = async () => {
    try {
      // Use current UI language for the driver's approval email (ar/he)
      const adminLanguage = i18n.language || "ar";
      const res = await fetch(
        `${API_BASE_URL}/admin/drivers/${driver.driver_profile_id}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            admin_user_id: adminUserId,
            reason: null,
            driver_language: adminLanguage,
          }),
        }
      );
      const json = await res.json();
      if (!res.ok) {
        setErrorModal({
          visible: true,
          title: t("error") || "Error",
          message: json.detail || t("approve_failed") || "Failed to approve driver",
        });
      } else {
        setSuccessMessage(t("driver_approved") || "Driver approved");
        setSuccessModalVisible(true);
      }
    } catch (e: any) {
      setErrorModal({
        visible: true,
        title: t("error") || "Error",
        message: e.message || t("network_error_message") || t("network_error") || "Network error occurred",
      });
    }
  };

  const handleRejectConfirm = async () => {
    if (!rejectReason.trim()) {
      setErrorModal({
        visible: true,
        title: t("error") || "Error",
        message: t("please_type_reason") || "Please type a rejection reason",
      });
      return;
    }
    try {
      // Get admin's current language for driver email (default to Arabic)
      const adminLanguage = i18n.language || "ar";
      
      const res = await fetch(
        `${API_BASE_URL}/admin/drivers/${driver.driver_profile_id}/reject`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            admin_user_id: adminUserId,
            reason: rejectReason.trim(),
            driver_language: adminLanguage, // Pass admin's language (will be used for driver email)
          }),
        }
      );
      const json = await res.json();
      if (!res.ok) {
        setErrorModal({
          visible: true,
          title: t("error") || "Error",
          message: json.detail || t("reject_failed") || "Failed to reject driver",
        });
      } else {
        setRejectModalVisible(false);
        setRejectReason("");
        setSuccessMessage(t("driver_rejected") || "Driver rejected");
        setSuccessModalVisible(true);
      }
    } catch (e: any) {
      setErrorModal({
        visible: true,
        title: t("error") || "Error",
        message: e.message || t("network_error_message") || t("network_error") || "Network error occurred",
      });
    }
  };

  const renderPersonal = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t("personal_info")}</Text>
      <View style={styles.infoCard}>
        <Text style={styles.infoLabel}>{t("full_name")}</Text>
        <Text style={styles.infoValue}>{driver.full_name}</Text>
      </View>
      <View style={styles.infoCard}>
        <Text style={styles.infoLabel}>{t("email")}</Text>
        <Text style={styles.infoValue}>{driver.email}</Text>
      </View>
      <View style={styles.infoCard}>
        <Text style={styles.infoLabel}>{t("phone")}</Text>
        <Text style={styles.infoValue}>{driver.phone}</Text>
      </View>
      <View style={styles.infoCard}>
        <Text style={styles.infoLabel}>{t("driver_status")}</Text>
        <View style={[
          styles.statusBadge,
          driver.driver_status === "PENDING" && styles.statusBadgePending,
          driver.driver_status === "APPROVED" && styles.statusBadgeApproved,
          driver.driver_status === "REJECTED" && styles.statusBadgeRejected,
          (driver.driver_status === "SUBMITTED" || driver.driver_status === "submitted") && styles.statusBadgeSubmitted,
        ]}>
          <Text style={styles.statusText}>
            {getStatusTranslation(driver.driver_status)}
          </Text>
        </View>
      </View>
      <View style={styles.infoCard}>
        <Text style={styles.infoLabel}>{t("vehicle_status")}</Text>
        <View style={[
          styles.statusBadge,
          driver.vehicle_status === "PENDING" && styles.statusBadgePending,
          driver.vehicle_status === "APPROVED" && styles.statusBadgeApproved,
          driver.vehicle_status === "REJECTED" && styles.statusBadgeRejected,
          (driver.vehicle_status === "SUBMITTED" || driver.vehicle_status === "submitted") && styles.statusBadgeSubmitted,
        ]}>
          <Text style={styles.statusText}>
            {getStatusTranslation(driver.vehicle_status)}
          </Text>
        </View>
      </View>

      <Text style={styles.sectionTitleSpaced}>{t("id_license")}</Text>
      {driver.id_card_image_url && (
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>{t("id_number") || t("id_card") || "ID Number"}</Text>
          {/* Check if it's a URL (image) or just a number string */}
          {driver.id_card_image_url.startsWith("http://") || driver.id_card_image_url.startsWith("https://") ? (
            <View style={styles.imageRow}>
              <AttachmentPreview
                url={driver.id_card_image_url}
                imageStyle={styles.documentImage}
                onPress={
                  isImageAttachmentUrl(driver.id_card_image_url)
                    ? () => openViewer([driver.id_card_image_url], 0)
                    : undefined
                }
              />
            </View>
          ) : (
            <Text style={styles.infoValue}>{driver.id_card_image_url}</Text>
          )}
        </View>
      )}
      {driver.driver_license_image_url && (
        <View style={styles.imageRow}>
          <Text style={styles.imageLabel}>{t("driver_license")}</Text>
          <AttachmentPreview
            url={driver.driver_license_image_url}
            imageStyle={styles.documentImage}
            onPress={
              isImageAttachmentUrl(driver.driver_license_image_url)
                ? () => openViewer([driver.driver_license_image_url], 0)
                : undefined
            }
          />
        </View>
      )}
    </View>
  );

  const renderVehicle = () => (
    <>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("car_info")}</Text>
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>{t("car_type")}</Text>
          <Text style={styles.infoValue}>{driver.car_type}</Text>
        </View>
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>{t("plate_number")}</Text>
          <Text style={styles.infoValue}>{driver.plate_number}</Text>
        </View>
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>{t("production_year")}</Text>
          <Text style={styles.infoValue}>{driver.production_year}</Text>
        </View>

        <Text style={styles.sectionTitleSpaced}>{t("car_documents")}</Text>
        {driver.car_license_image_url && (
          <View style={styles.imageRow}>
            <Text style={styles.imageLabel}>{t("car_license")}</Text>
            <AttachmentPreview
              url={driver.car_license_image_url}
              imageStyle={styles.documentImage}
              onPress={
                isImageAttachmentUrl(driver.car_license_image_url)
                  ? () => openViewer([driver.car_license_image_url], 0)
                  : undefined
              }
            />
          </View>
        )}
        {driver.car_insurance_image_url && (
          <View style={styles.imageRow}>
            <Text style={styles.imageLabel}>{t("car_insurance")}</Text>
            <AttachmentPreview
              url={driver.car_insurance_image_url}
              imageStyle={styles.documentImage}
              onPress={
                isImageAttachmentUrl(driver.car_insurance_image_url)
                  ? () => openViewer([driver.car_insurance_image_url], 0)
                  : undefined
              }
            />
          </View>
        )}
        {carPhotos.length > 0 && (
          <View style={styles.imageRow}>
            <Text style={styles.imageLabel}>
              {t("car_photos")} ({carPhotos.length})
            </Text>
            <View style={styles.imagesGrid}>
              {carPhotos.map((url, index) => (
                <View key={index} style={styles.imageWrapper}>
                  <TouchableOpacity activeOpacity={0.9} onPress={() => openViewer(carPhotos, index)}>
                    <Image
                      source={{ uri: url }}
                      style={styles.carPhotoImage}
                      resizeMode="cover"
                      onError={(e) => console.log(`Car photo ${index} error:`, e.nativeEvent.error, "URL:", url)}
                    />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>
        )}
      </View>

      {/* Approve / Reject buttons - shown after car info */}
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.actionButton, styles.rejectButton]}
          onPress={() => setRejectModalVisible(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.actionText}>{t("reject")}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.acceptButton]}
          onPress={handleApprove}
          activeOpacity={0.8}
        >
          <Text style={styles.actionText}>{t("accept")}</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  const formatDateTime = (iso: string) => {
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      return d.toLocaleDateString() + " • " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return iso;
    }
  };

  const renderStars = (stars: number, size: number = 14) => {
    const full = Math.max(0, Math.min(5, Math.round(stars)));
    const items: React.ReactNode[] = [];
    for (let i = 0; i < 5; i++) {
      items.push(
        <Ionicons
          key={i}
          name={i < full ? "star" : "star-outline"}
          size={size}
          color={i < full ? "#F59E0B" : "#D1D5DB"}
        />
      );
    }
    return <View style={{ flexDirection: "row", gap: 2 }}>{items}</View>;
  };

  const renderFeedback = () => {
    const avg = Number(ratingSummary.rating_avg || 0);
    const count = Number(ratingSummary.rating_count || 0);
    const pending = reportsSummary?.pending ?? 0;
    const totalReports = reportsSummary?.total ?? 0;

    return (
      <View>
        {/* Rating summary card */}
        <View style={styles.feedbackCard}>
          <Text style={styles.sectionTitle}>
            {t("admin_driver_rating_summary") || "Rating summary"}
          </Text>

          {count === 0 ? (
            <View style={styles.feedbackEmptyBox}>
              <Ionicons name="star-outline" size={28} color="#9CA3AF" />
              <Text style={styles.feedbackEmptyText}>
                {t("admin_driver_no_ratings") || "No ratings yet"}
              </Text>
            </View>
          ) : (
            <View style={styles.ratingRow}>
              <View style={{ alignItems: "center", minWidth: 90 }}>
                <Text style={styles.ratingAvgBig}>{avg.toFixed(1)}</Text>
                {renderStars(avg, 16)}
                <Text style={styles.ratingCountSmall}>
                  {t("admin_driver_ratings_count", { count }) ||
                    `${count} rating${count === 1 ? "" : "s"}`}
                </Text>
              </View>
              <View style={{ flex: 1, marginLeft: 16 }}>
                <Text style={styles.feedbackHint}>
                  {t("admin_driver_rating_hint") ||
                    "Average of all passenger ratings for this driver."}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Reports summary card */}
        <View style={styles.feedbackCard}>
          <View style={styles.reportsCardHeader}>
            <Text style={styles.sectionTitle}>
              {t("admin_driver_reports_summary") || "Reports summary"}
            </Text>
            {pending > 0 && (
              <View style={styles.pendingBadge}>
                <Text style={styles.pendingBadgeText}>{pending}</Text>
              </View>
            )}
          </View>

          {reportsSummary == null && feedbackLoading ? (
            <ActivityIndicator size="small" color={DARK_TEAL} />
          ) : totalReports === 0 ? (
            <View style={styles.feedbackEmptyBox}>
              <Ionicons name="shield-checkmark-outline" size={26} color="#10B981" />
              <Text style={styles.feedbackEmptyText}>
                {t("admin_driver_no_reports") || "No reports for this driver"}
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.reportsCountsRow}>
                <View style={[styles.reportsCountChip, styles.reportsCountPending]}>
                  <Text style={styles.reportsCountLabel}>
                    {t("admin_reports_filter_pending") || "Pending"}
                  </Text>
                  <Text style={styles.reportsCountValue}>
                    {reportsSummary?.pending ?? 0}
                  </Text>
                </View>
                <View style={[styles.reportsCountChip, styles.reportsCountReviewed]}>
                  <Text style={styles.reportsCountLabel}>
                    {t("admin_reports_filter_reviewed") || "Reviewed"}
                  </Text>
                  <Text style={styles.reportsCountValue}>
                    {reportsSummary?.reviewed ?? 0}
                  </Text>
                </View>
                <View style={[styles.reportsCountChip, styles.reportsCountDismissed]}>
                  <Text style={styles.reportsCountLabel}>
                    {t("admin_reports_filter_dismissed") || "Dismissed"}
                  </Text>
                  <Text style={styles.reportsCountValue}>
                    {reportsSummary?.dismissed ?? 0}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.openReportsButton}
                activeOpacity={0.85}
                onPress={() =>
                  navigation.navigate("AdminDriverReports", {
                    adminUserId,
                    role,
                  })
                }
              >
                <Ionicons name="flag" size={16} color="#FFFFFF" />
                <Text style={styles.openReportsButtonText}>
                  {t("admin_driver_open_reports") || "Open reports screen"}
                </Text>
                <Ionicons name="chevron-forward" size={16} color="#FFFFFF" />
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Ratings history list */}
        <View style={styles.feedbackCard}>
          <Text style={styles.sectionTitle}>
            {t("admin_driver_ratings_history") || "Ratings history"}
          </Text>

          {feedbackLoading && ratings.length === 0 ? (
            <ActivityIndicator size="small" color={DARK_TEAL} />
          ) : feedbackError ? (
            <Text style={styles.feedbackErrorText}>{feedbackError}</Text>
          ) : ratings.length === 0 ? (
            <View style={styles.feedbackEmptyBox}>
              <Ionicons name="chatbubble-ellipses-outline" size={26} color="#9CA3AF" />
              <Text style={styles.feedbackEmptyText}>
                {t("admin_driver_no_ratings") || "No ratings yet"}
              </Text>
            </View>
          ) : (
            ratings.map((r) => (
              <View key={r.id} style={styles.ratingItem}>
                <View style={styles.ratingItemHeader}>
                  <Text style={styles.ratingItemName} numberOfLines={1}>
                    {r.regular_full_name ||
                      r.regular_username ||
                      t("admin_driver_rating_anonymous") ||
                      "Passenger"}
                  </Text>
                  {renderStars(r.stars, 13)}
                </View>
                {r.comment ? (
                  <Text style={styles.ratingItemComment}>{r.comment}</Text>
                ) : null}
                <Text style={styles.ratingItemDate}>{formatDateTime(r.created_at)}</Text>
              </View>
            ))
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Modern Centered Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{driver.full_name}</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabsRow}>
        <TouchableOpacity
          style={[styles.tabButton, tab === "personal" && styles.tabButtonActive]}
          onPress={() => setTab("personal")}
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.tabButtonText,
              tab === "personal" && styles.tabButtonTextActive,
            ]}
          >
            {t("personal")}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, tab === "vehicle" && styles.tabButtonActive]}
          onPress={() => setTab("vehicle")}
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.tabButtonText,
              tab === "vehicle" && styles.tabButtonTextActive,
            ]}
          >
            {t("car_files")}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, tab === "feedback" && styles.tabButtonActive]}
          onPress={() => setTab("feedback")}
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.tabButtonText,
              tab === "feedback" && styles.tabButtonTextActive,
            ]}
          >
            {t("admin_driver_tab_feedback") || "Feedback"}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {tab === "personal" && renderPersonal()}
        {tab === "vehicle" && renderVehicle()}
        {tab === "feedback" && renderFeedback()}
      </ScrollView>

      {/* Reject modal */}
      <Modal
        visible={rejectModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setRejectModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t("reject_reason")}</Text>
            <TextInput
              style={styles.modalInput}
              placeholder={t("type_reject_reason")}
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              placeholderTextColor="#94A3B8"
            />
            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancel]}
                onPress={() => {
                  setRejectModalVisible(false);
                  setRejectReason("");
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.modalButtonText}>{t("cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalConfirm]}
                onPress={handleRejectConfirm}
                activeOpacity={0.8}
              >
                <Text style={[styles.modalButtonText, styles.modalConfirmText]}>
                  {t("reject")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Success Modal */}
      <MessageModal
        visible={successModalVisible}
        type="success"
        title={t("done") || t("success") || "Done"}
        message={successMessage}
        onClose={() => {
          setSuccessModalVisible(false);
          navigation.goBack();
        }}
      />

      {/* Error Modal */}
      <MessageModal
        visible={errorModal.visible}
        type="error"
        title={errorModal.title}
        message={errorModal.message}
        onClose={() => setErrorModal({ ...errorModal, visible: false })}
      />

      <FullscreenImageViewer
        visible={viewerVisible}
        images={viewerImages}
        initialIndex={viewerIndex}
        onRequestClose={() => setViewerVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: "#FFFFFF" 
  },
  header: {
    paddingTop: Platform.OS === "ios" ? 12 : StatusBar.currentHeight ? StatusBar.currentHeight + 4 : 12,
    paddingBottom: 0,
    paddingHorizontal: 24,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: DARK_TEAL,
    letterSpacing: -0.3,
    textAlign: "center",
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  tabsRow: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 12,
    backgroundColor: "#F8F9FA",
    borderRadius: 18,
    padding: 4,
    borderWidth: 1,
    borderColor: "#E8E8E8",
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 14,
    alignItems: "center",
  },
  tabButtonActive: {
    backgroundColor: DARK_TEAL,
    shadowColor: DARK_TEAL,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  tabButtonTextActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 100,
  },
  section: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    borderWidth: 0.5,
    borderColor: "#E5E7EB",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: DARK_TEAL,
    marginBottom: 14,
    letterSpacing: -0.2,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  sectionTitleSpaced: {
    fontSize: 18,
    fontWeight: "600",
    color: DARK_TEAL,
    marginTop: 16,
    marginBottom: 14,
    letterSpacing: -0.2,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  infoCard: {
    backgroundColor: "#F8F9FA",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 0.5,
    borderColor: "#E5E7EB",
  },
  infoLabel: {
    fontWeight: "500",
    color: "#6B7280",
    fontSize: 12,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  infoValue: {
    color: "#1A1A1A",
    fontSize: 15,
    fontWeight: "500",
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
    lineHeight: 20,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1.5,
    alignSelf: "flex-start",
    marginTop: 4,
  },
  statusBadgePending: {
    backgroundColor: "#FFF3E0",
    borderColor: "#FFA500",
  },
  statusBadgeApproved: {
    backgroundColor: "#E8F5E9",
    borderColor: "#4CAF50",
  },
  statusBadgeRejected: {
    backgroundColor: "#FFEBEE",
    borderColor: "#F44336",
  },
  statusBadgeSubmitted: {
    backgroundColor: "#E3F2FD",
    borderColor: "#2196F3",
  },
  statusText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: "#333",
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  actionsRow: {
    flexDirection: "row",
    padding: 20,
    marginTop: 8,
    marginBottom: 20,
    marginHorizontal: 20,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 18,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  rejectButton: {
    backgroundColor: "#F44336",
    marginRight: 10,
  },
  acceptButton: {
    backgroundColor: DARK_TEAL,
    marginLeft: 10,
  },
  actionText: {
    color: "#FFF",
    fontWeight: "700",
    fontSize: 16,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "85%",
    backgroundColor: "#FFF",
    borderRadius: 22,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 16,
    color: DARK_TEAL,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#E8E8E8",
    borderRadius: 14,
    padding: 14,
    minHeight: 100,
    textAlignVertical: "top",
    marginBottom: 16,
    backgroundColor: "#F8F9FA",
    fontSize: 15,
    color: "#1A1A1A",
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  modalButtonsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 14,
  },
  modalCancel: {
    backgroundColor: "#F8F9FA",
    borderWidth: 1,
    borderColor: "#E8E8E8",
  },
  modalConfirm: {
    backgroundColor: DARK_TEAL,
  },
  modalButtonText: {
    fontWeight: "600",
    color: "#6B7280",
    fontSize: 15,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  modalConfirmText: {
    color: "#FFFFFF",
  },
  imageRow: {
    marginBottom: 16,
  },
  imageLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: DARK_TEAL,
    marginBottom: 8,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  documentImage: {
    width: "100%",
    height: 250,
    borderRadius: 12,
    marginTop: 6,
    resizeMode: "contain",
    backgroundColor: "#F8F9FA",
    borderWidth: 0.5,
    borderColor: "#E5E7EB",
  },
  imagesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 12,
    gap: 12,
  },
  imageWrapper: {
    width: "48%",
    aspectRatio: 1,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#F8F9FA",
    borderWidth: 0.5,
    borderColor: "#E5E7EB",
  },
  carPhotoImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  // ---- Feedback tab ----
  feedbackCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    borderWidth: 0.5,
    borderColor: "#E5E7EB",
  },
  feedbackEmptyBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    gap: 8,
  },
  feedbackEmptyText: {
    color: "#6B7280",
    fontSize: 13,
    fontWeight: "500",
  },
  feedbackErrorText: {
    color: "#C62828",
    fontSize: 13,
    fontWeight: "500",
  },
  feedbackHint: {
    color: "#6B7280",
    fontSize: 12,
    lineHeight: 17,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  ratingAvgBig: {
    fontSize: 36,
    fontWeight: "800",
    color: "#111827",
    letterSpacing: -1,
    marginBottom: 4,
  },
  ratingCountSmall: {
    marginTop: 4,
    fontSize: 11,
    color: "#6B7280",
    fontWeight: "600",
  },
  reportsCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pendingBadge: {
    marginLeft: 8,
    minWidth: 24,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: "#c5322a",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  pendingBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  reportsCountsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  reportsCountChip: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  reportsCountPending: {
    backgroundColor: "#FFF3E0",
    borderColor: "#F4B343",
  },
  reportsCountReviewed: {
    backgroundColor: "#E8F5E9",
    borderColor: "#4CAF50",
  },
  reportsCountDismissed: {
    backgroundColor: "#F3F4F6",
    borderColor: "#D1D5DB",
  },
  reportsCountLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#374151",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  reportsCountValue: {
    fontSize: 20,
    fontWeight: "800",
    color: "#111827",
  },
  openReportsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: DARK_TEAL,
  },
  openReportsButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
    letterSpacing: 0.2,
  },
  ratingItem: {
    paddingVertical: 12,
    borderTopWidth: 0.5,
    borderTopColor: "#E5E7EB",
  },
  ratingItemHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
    gap: 10,
  },
  ratingItemName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  ratingItemComment: {
    color: "#374151",
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 6,
  },
  ratingItemDate: {
    fontSize: 11,
    color: "#9CA3AF",
    fontWeight: "500",
  },
});
