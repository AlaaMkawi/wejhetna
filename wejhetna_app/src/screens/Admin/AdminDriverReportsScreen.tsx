import React, { useCallback, useMemo, useState } from "react";
import { appAlert } from "../../utils/appAlert";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import Ionicons from "react-native-vector-icons/Ionicons";
import { RootStackParamList } from "../../navigation/types";
import {
  adminListDriverReports,
  adminReviewDriverReport,
  AdminDriverReport,
} from "../../api/rides";

const DARK_TEAL = "#0f5b63";
const DANGER = "#c5322a";
const MUTED = "#6B7280";
const BORDER = "#E5E7EB";

type Props = NativeStackScreenProps<RootStackParamList, "AdminDriverReports">;

type StatusFilter = "ALL" | "PENDING" | "REVIEWED" | "DISMISSED";

const FILTERS: { key: StatusFilter; labelKey: string; fallback: string }[] = [
  { key: "PENDING", labelKey: "admin_reports_filter_pending", fallback: "Pending" },
  { key: "REVIEWED", labelKey: "admin_reports_filter_reviewed", fallback: "Reviewed" },
  { key: "DISMISSED", labelKey: "admin_reports_filter_dismissed", fallback: "Dismissed" },
  { key: "ALL", labelKey: "admin_reports_filter_all", fallback: "All" },
];

function formatTimestamp(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso ?? "";
    return d.toLocaleString();
  } catch {
    return iso ?? "";
  }
}

export default function AdminDriverReportsScreen({ route }: Props) {
  const { t } = useTranslation();
  const { adminUserId } = route.params;

  const [reports, setReports] = useState<AdminDriverReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>("PENDING");
  const [error, setError] = useState<string | null>(null);

  const [actionTarget, setActionTarget] = useState<AdminDriverReport | null>(null);
  const [actionNotes, setActionNotes] = useState("");
  const [actionStatus, setActionStatus] = useState<"REVIEWED" | "DISMISSED">(
    "REVIEWED"
  );
  const [savingAction, setSavingAction] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const rows = await adminListDriverReports(
        filter === "ALL" ? undefined : filter
      );
      setReports(rows);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  const openActionModal = (report: AdminDriverReport) => {
    setActionTarget(report);
    setActionNotes(report.admin_notes ?? "");
    setActionStatus(report.status === "DISMISSED" ? "DISMISSED" : "REVIEWED");
  };

  const submitAction = async () => {
    if (!actionTarget) return;
    setSavingAction(true);
    try {
      const updated = await adminReviewDriverReport({
        report_id: actionTarget.id,
        admin_user_id: adminUserId,
        status: actionStatus,
        admin_notes: actionNotes.trim() || undefined,
      });
      setReports((prev) =>
        prev.map((r) => (r.id === updated.id ? updated : r))
      );
      setActionTarget(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      appAlert(t("error") || "Error", msg);
    } finally {
      setSavingAction(false);
    }
  };

  const pendingCount = useMemo(
    () => reports.filter((r) => r.status === "PENDING").length,
    [reports]
  );

  const renderReport = ({ item }: { item: AdminDriverReport }) => {
    const statusColor =
      item.status === "PENDING"
        ? "#b45309"
        : item.status === "REVIEWED"
          ? "#047857"
          : "#6b7280";
    const statusBg =
      item.status === "PENDING"
        ? "#fffbeb"
        : item.status === "REVIEWED"
          ? "#ecfdf5"
          : "#f3f4f6";
    return (
      <View style={styles.reportCard}>
        <View style={styles.reportHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.reportTitle} numberOfLines={1}>
              {item.driver_full_name || `@${item.driver_username}`}
            </Text>
            <Text style={styles.reportMeta} numberOfLines={1}>
              @{item.driver_username} · {t("admin_reports_ride_label") || "ride"} #
              {item.ride_request_id ?? "—"}
            </Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: statusBg, borderColor: statusColor },
            ]}
          >
            <Text style={[styles.statusBadgeText, { color: statusColor }]}>
              {t(`admin_reports_status_${item.status.toLowerCase()}`) ||
                item.status}
            </Text>
          </View>
        </View>

        <Text style={styles.reportMessage} numberOfLines={6}>
          {item.message}
        </Text>

        <View style={styles.reporterRow}>
          <Ionicons name="person-outline" size={14} color={MUTED} />
          <Text style={styles.reporterText} numberOfLines={1}>
            {t("admin_reports_from_user") || "From"}:{" "}
            {item.regular_full_name || `@${item.regular_username}`}
          </Text>
        </View>

        <View style={styles.timestampRow}>
          <Text style={styles.timestamp}>
            {t("admin_reports_received") || "Received"}:{" "}
            {formatTimestamp(item.created_at)}
          </Text>
          {item.reviewed_at ? (
            <Text style={styles.timestamp}>
              {t("admin_reports_reviewed") || "Reviewed"}:{" "}
              {formatTimestamp(item.reviewed_at)}
            </Text>
          ) : null}
        </View>

        {item.admin_notes ? (
          <View style={styles.notesBox}>
            <Text style={styles.notesLabel}>
              {t("admin_reports_notes_label") || "Admin notes"}
            </Text>
            <Text style={styles.notesText}>{item.admin_notes}</Text>
          </View>
        ) : null}

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.primaryActionBtn}
            onPress={() => openActionModal(item)}
          >
            <Ionicons
              name={item.status === "PENDING" ? "checkmark-done" : "pencil"}
              size={16}
              color="#fff"
            />
            <Text style={styles.primaryActionText}>
              {item.status === "PENDING"
                ? t("admin_reports_take_action") || "Take action"
                : t("admin_reports_update") || "Update"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <View style={styles.header}>
        <Text style={styles.title}>
          {t("admin_reports_title") || "Driver reports"}
        </Text>
        {pendingCount > 0 ? (
          <Text style={styles.subtitle}>
            {(t("admin_reports_pending_count") || "{{count}} pending reports").replace(
              "{{count}}",
              String(pendingCount)
            )}
          </Text>
        ) : null}
      </View>

      <View style={styles.filtersRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[
              styles.filterChip,
              filter === f.key && styles.filterChipActive,
            ]}
            onPress={() => {
              setFilter(f.key);
              setLoading(true);
            }}
          >
            <Text
              style={[
                styles.filterChipText,
                filter === f.key && styles.filterChipTextActive,
              ]}
            >
              {t(f.labelKey) || f.fallback}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={DARK_TEAL} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => { setLoading(true); void load(); }}>
            <Text style={styles.retryBtnText}>{t("retry") || "Retry"}</Text>
          </TouchableOpacity>
        </View>
      ) : reports.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="document-outline" size={48} color="#9ca3af" />
          <Text style={styles.emptyText}>
            {t("admin_reports_empty") || "No reports in this category"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={reports}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderReport}
          refreshing={refreshing}
          onRefresh={onRefresh}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      <Modal
        visible={!!actionTarget}
        transparent
        animationType="fade"
        onRequestClose={() => (savingAction ? null : setActionTarget(null))}
      >
        <KeyboardAvoidingView
          style={styles.modalKbv}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable
            style={styles.modalOverlay}
            onPress={() => !savingAction && setActionTarget(null)}
          >
            <Pressable style={styles.modalCard} onPress={() => {}}>
              <Text style={styles.modalTitle}>
                {t("admin_reports_action_title") || "Resolve report"}
              </Text>
              <Text style={styles.modalSubtitle} numberOfLines={2}>
                {actionTarget?.driver_full_name} · @{actionTarget?.driver_username}
              </Text>

              <Text style={styles.modalSectionLabel}>
                {t("admin_reports_action_status") || "New status"}
              </Text>
              <View style={styles.segmentRow}>
                <TouchableOpacity
                  style={[
                    styles.segmentBtn,
                    actionStatus === "REVIEWED" && styles.segmentBtnActive,
                  ]}
                  onPress={() => setActionStatus("REVIEWED")}
                >
                  <Ionicons
                    name="checkmark-done"
                    size={14}
                    color={actionStatus === "REVIEWED" ? "#fff" : DARK_TEAL}
                  />
                  <Text
                    style={[
                      styles.segmentText,
                      actionStatus === "REVIEWED" && styles.segmentTextActive,
                    ]}
                  >
                    {t("admin_reports_action_reviewed") || "Reviewed"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.segmentBtn,
                    actionStatus === "DISMISSED" && styles.segmentBtnActive,
                  ]}
                  onPress={() => setActionStatus("DISMISSED")}
                >
                  <Ionicons
                    name="close-circle"
                    size={14}
                    color={actionStatus === "DISMISSED" ? "#fff" : DANGER}
                  />
                  <Text
                    style={[
                      styles.segmentText,
                      actionStatus === "DISMISSED" && styles.segmentTextActive,
                    ]}
                  >
                    {t("admin_reports_action_dismissed") || "Dismiss"}
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.modalSectionLabel}>
                {t("admin_reports_action_notes") || "Notes (internal)"}
              </Text>
              <TextInput
                style={styles.modalTextarea}
                value={actionNotes}
                onChangeText={setActionNotes}
                multiline
                placeholder={t("admin_reports_action_notes_ph") || "Why this decision?"}
                placeholderTextColor="#9ca3af"
                maxLength={2000}
                editable={!savingAction}
              />

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalCancel]}
                  onPress={() => setActionTarget(null)}
                  disabled={savingAction}
                >
                  <Text style={styles.modalCancelText}>
                    {t("cancel") || "Cancel"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalSave, savingAction && { opacity: 0.7 }]}
                  onPress={submitAction}
                  disabled={savingAction}
                >
                  {savingAction ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.modalSaveText}>
                      {t("save") || "Save"}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  header: {
    paddingTop: Platform.OS === "ios" ? 12 : (StatusBar.currentHeight ? StatusBar.currentHeight + 4 : 12),
    paddingHorizontal: 20,
    paddingBottom: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: DARK_TEAL,
    textAlign: "center",
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    color: MUTED,
  },
  filtersRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 6,
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  filterChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#f9fafb",
  },
  filterChipActive: {
    backgroundColor: DARK_TEAL,
    borderColor: DARK_TEAL,
  },
  filterChipText: {
    fontSize: 13,
    color: "#111827",
    fontWeight: "600",
  },
  filterChipTextActive: {
    color: "#fff",
  },
  listContent: {
    padding: 16,
    paddingBottom: 60,
  },
  reportCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(15,91,99,0.15)",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  reportHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  reportTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  reportMeta: {
    marginTop: 2,
    fontSize: 12,
    color: MUTED,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    marginLeft: 10,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  reportMessage: {
    marginTop: 4,
    fontSize: 14,
    color: "#1f2937",
    lineHeight: 20,
  },
  reporterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
  },
  reporterText: {
    flex: 1,
    fontSize: 12,
    color: MUTED,
  },
  timestampRow: {
    marginTop: 8,
    gap: 2,
  },
  timestamp: {
    fontSize: 11,
    color: "#9ca3af",
  },
  notesBox: {
    marginTop: 10,
    padding: 10,
    backgroundColor: "#f9fafb",
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
  },
  notesLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  notesText: {
    fontSize: 13,
    color: "#111827",
    lineHeight: 18,
  },
  actionRow: {
    marginTop: 12,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  primaryActionBtn: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: DARK_TEAL,
  },
  primaryActionText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },
  emptyText: {
    marginTop: 8,
    fontSize: 14,
    color: MUTED,
    textAlign: "center",
  },
  errorText: {
    fontSize: 14,
    color: DANGER,
    textAlign: "center",
  },
  retryBtn: {
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: DARK_TEAL,
    borderRadius: 8,
  },
  retryBtnText: {
    color: "#fff",
    fontWeight: "700",
  },
  modalKbv: { flex: 1 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(17,24,39,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 18,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
  },
  modalSubtitle: {
    marginTop: 2,
    fontSize: 13,
    color: MUTED,
    marginBottom: 14,
  },
  modalSectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
    marginTop: 6,
  },
  segmentRow: {
    flexDirection: "row",
    gap: 8,
  },
  segmentBtn: {
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
  segmentBtnActive: {
    backgroundColor: DARK_TEAL,
    borderColor: DARK_TEAL,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#111827",
  },
  segmentTextActive: {
    color: "#fff",
  },
  modalTextarea: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 12,
    minHeight: 100,
    textAlignVertical: "top",
    fontSize: 14,
    color: "#111827",
    backgroundColor: "#fafafa",
    marginBottom: 12,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  modalCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  modalCancelText: {
    color: "#111827",
    fontWeight: "700",
  },
  modalSave: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: DARK_TEAL,
    alignItems: "center",
    justifyContent: "center",
  },
  modalSaveText: {
    color: "#fff",
    fontWeight: "700",
  },
});
