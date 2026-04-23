import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import Ionicons from "react-native-vector-icons/Ionicons";
import {
  submitDriverRating,
  submitDriverReport,
} from "../../api/rides";

const TEAL = "#0f5b63";
const GOLD = "#f5a623";
const MUTED = "#6b7280";
const BORDER = "#e5e7eb";
const DANGER = "#c5322a";

export type PostRideFeedbackTarget = {
  rideRequestId: number;
  regularUserId: number;
  driverFullName: string;
  driverUsername: string;
  /** Hide the "Rate" tab if the user has already rated this ride. */
  alreadyRated?: boolean;
  /** Hide the "Report" tab if the user has already reported this ride. */
  alreadyReported?: boolean;
};

type Tab = "rate" | "report";

export type PostRideFeedbackModalProps = {
  visible: boolean;
  target: PostRideFeedbackTarget | null;
  /** Initial tab; defaults to "rate". */
  initialTab?: Tab;
  onClose: () => void;
  /** Called after a successful rating save (so the caller can refresh UI/state). */
  onRatingSubmitted?: () => void;
  /** Called after a successful report submission. */
  onReportSubmitted?: () => void;
};

/**
 * Dedicated post-ride feedback modal.
 * Ratings and reports are kept fully separate (two tabs, two endpoints) so the
 * admin side can moderate reports without them polluting the driver's public
 * rating average.
 */
export function PostRideFeedbackModal({
  visible,
  target,
  initialTab = "rate",
  onClose,
  onRatingSubmitted,
  onReportSubmitted,
}: PostRideFeedbackModalProps) {
  const { t } = useTranslation();

  const [tab, setTab] = useState<Tab>(initialTab);
  const [stars, setStars] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [reportMessage, setReportMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    // Reset on every open so state doesn't leak between rides.
    setStars(0);
    setRatingComment("");
    setReportMessage("");
    setSubmitting(false);
    setTab(
      target?.alreadyRated && !target?.alreadyReported
        ? "report"
        : initialTab
    );
  }, [visible, initialTab, target?.alreadyRated, target?.alreadyReported]);

  const canSubmitRating = stars >= 1 && stars <= 5 && !submitting;
  const canSubmitReport = reportMessage.trim().length >= 3 && !submitting;

  const driverLabel = useMemo(() => {
    if (!target) return "";
    if (target.driverFullName) return target.driverFullName;
    return `@${target.driverUsername}`;
  }, [target]);

  const handleSubmitRating = async () => {
    if (!target || !canSubmitRating) return;
    setSubmitting(true);
    try {
      await submitDriverRating({
        ride_request_id: target.rideRequestId,
        regular_user_id: target.regularUserId,
        stars,
        comment: ratingComment.trim() || undefined,
      });
      Alert.alert(t("success") || "Thanks", t("ride_rating_thanks") || "Thanks for your feedback!");
      onRatingSubmitted?.();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert(t("error") || "Error", msg || t("ride_rating_failed") || "Rating failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitReport = async () => {
    if (!target || !canSubmitReport) return;
    setSubmitting(true);
    try {
      await submitDriverReport({
        ride_request_id: target.rideRequestId,
        regular_user_id: target.regularUserId,
        message: reportMessage.trim(),
      });
      Alert.alert(
        t("success") || "Received",
        t("ride_report_thanks") || "Your report has been sent to the admin team."
      );
      onReportSubmitted?.();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert(t("error") || "Error", msg || t("ride_report_failed") || "Report failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (!target) {
    return null;
  }

  const rateTabDisabled = !!target.alreadyRated;
  const reportTabDisabled = !!target.alreadyReported;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={submitting ? undefined : onClose}
    >
      <KeyboardAvoidingView
        style={styles.kbv}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={styles.overlay} onPress={submitting ? undefined : onClose}>
          <Pressable style={styles.card} onPress={() => {}}>
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>
                  {t("ride_feedback_title") || "Ride feedback"}
                </Text>
                <Text style={styles.subtitle} numberOfLines={1}>
                  {driverLabel}
                </Text>
              </View>
              <TouchableOpacity
                onPress={onClose}
                disabled={submitting}
                style={styles.closeBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={20} color="#374151" />
              </TouchableOpacity>
            </View>

            <View style={styles.tabsRow}>
              <TouchableOpacity
                style={[
                  styles.tabBtn,
                  tab === "rate" && styles.tabBtnActive,
                  rateTabDisabled && styles.tabBtnDisabled,
                ]}
                onPress={() => !rateTabDisabled && setTab("rate")}
                disabled={rateTabDisabled}
              >
                <Ionicons
                  name="star"
                  size={14}
                  color={
                    rateTabDisabled ? "#9ca3af" : tab === "rate" ? "#fff" : TEAL
                  }
                />
                <Text
                  style={[
                    styles.tabText,
                    tab === "rate" && styles.tabTextActive,
                    rateTabDisabled && styles.tabTextDisabled,
                  ]}
                >
                  {t("ride_rate_tab") || "Rate"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.tabBtn,
                  tab === "report" && styles.tabBtnActive,
                  reportTabDisabled && styles.tabBtnDisabled,
                ]}
                onPress={() => !reportTabDisabled && setTab("report")}
                disabled={reportTabDisabled}
              >
                <Ionicons
                  name="flag"
                  size={14}
                  color={
                    reportTabDisabled
                      ? "#9ca3af"
                      : tab === "report"
                        ? "#fff"
                        : TEAL
                  }
                />
                <Text
                  style={[
                    styles.tabText,
                    tab === "report" && styles.tabTextActive,
                    reportTabDisabled && styles.tabTextDisabled,
                  ]}
                >
                  {t("ride_report_tab") || "Report"}
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.body}
              keyboardShouldPersistTaps="handled"
              bounces={false}
            >
              {tab === "rate" ? (
                <View>
                  <Text style={styles.sectionLabel}>
                    {t("ride_rate_prompt") || "How was your ride?"}
                  </Text>
                  <View style={styles.starsRow}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <TouchableOpacity
                        key={n}
                        onPress={() => setStars(n)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Ionicons
                          name={stars >= n ? "star" : "star-outline"}
                          size={32}
                          color={stars >= n ? GOLD : "#cbd5e1"}
                          style={styles.starIcon}
                        />
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.sectionLabel}>
                    {t("ride_rate_comment_label") || "Comment (optional)"}
                  </Text>
                  <TextInput
                    value={ratingComment}
                    onChangeText={setRatingComment}
                    placeholder={t("ride_rate_comment_placeholder") || "Tell us more…"}
                    placeholderTextColor="#9ca3af"
                    style={styles.textarea}
                    multiline
                    maxLength={500}
                    editable={!submitting}
                  />
                  <Text style={styles.charCount}>{ratingComment.length}/500</Text>

                  <TouchableOpacity
                    style={[
                      styles.primaryBtn,
                      !canSubmitRating && styles.primaryBtnDisabled,
                    ]}
                    onPress={handleSubmitRating}
                    disabled={!canSubmitRating}
                  >
                    {submitting ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.primaryBtnText}>
                        {t("ride_rate_submit") || "Submit rating"}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                <View>
                  <Text style={styles.sectionLabel}>
                    {t("ride_report_prompt") || "What went wrong?"}
                  </Text>
                  <Text style={styles.helperText}>
                    {t("ride_report_helper") ||
                      "Reports are sent privately to the admin team — they are separate from your public rating."}
                  </Text>

                  <TextInput
                    value={reportMessage}
                    onChangeText={setReportMessage}
                    placeholder={
                      t("ride_report_placeholder") || "Describe the issue in detail…"
                    }
                    placeholderTextColor="#9ca3af"
                    style={[styles.textarea, styles.textareaLarge]}
                    multiline
                    maxLength={2000}
                    editable={!submitting}
                  />
                  <Text style={styles.charCount}>
                    {reportMessage.trim().length}/2000
                  </Text>

                  <TouchableOpacity
                    style={[
                      styles.dangerBtn,
                      !canSubmitReport && styles.dangerBtnDisabled,
                    ]}
                    onPress={handleSubmitReport}
                    disabled={!canSubmitReport}
                  >
                    {submitting ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.primaryBtnText}>
                        {t("ride_report_submit") || "Send report"}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  kbv: { flex: 1 },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(17, 24, 39, 0.5)",
    justifyContent: "center",
    padding: 18,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 18,
    maxHeight: "85%",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.22,
        shadowRadius: 20,
      },
      android: { elevation: 12 },
      default: {},
    }),
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
  },
  subtitle: {
    marginTop: 2,
    fontSize: 13,
    color: MUTED,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f3f4f6",
  },
  tabsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#fff",
  },
  tabBtnActive: {
    backgroundColor: TEAL,
    borderColor: TEAL,
  },
  tabBtnDisabled: {
    backgroundColor: "#f3f4f6",
    borderColor: "#e5e7eb",
  },
  tabText: {
    color: TEAL,
    fontWeight: "700",
    fontSize: 13,
  },
  tabTextActive: {
    color: "#fff",
  },
  tabTextDisabled: {
    color: "#9ca3af",
  },
  body: { flexGrow: 0 },
  sectionLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
    marginTop: 4,
  },
  helperText: {
    fontSize: 12,
    color: MUTED,
    marginBottom: 10,
    lineHeight: 18,
  },
  starsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 18,
    paddingHorizontal: 8,
  },
  starIcon: {
    marginHorizontal: 2,
  },
  textarea: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 12,
    minHeight: 90,
    fontSize: 14,
    color: "#111827",
    textAlignVertical: "top",
    backgroundColor: "#fafafa",
  },
  textareaLarge: {
    minHeight: 130,
  },
  charCount: {
    alignSelf: "flex-end",
    fontSize: 11,
    color: MUTED,
    marginTop: 4,
    marginBottom: 14,
  },
  primaryBtn: {
    height: 48,
    borderRadius: 12,
    backgroundColor: TEAL,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnDisabled: {
    backgroundColor: "#9ca3af",
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  dangerBtn: {
    height: 48,
    borderRadius: 12,
    backgroundColor: DANGER,
    alignItems: "center",
    justifyContent: "center",
  },
  dangerBtnDisabled: {
    backgroundColor: "#d1a5a3",
  },
});

export default PostRideFeedbackModal;
