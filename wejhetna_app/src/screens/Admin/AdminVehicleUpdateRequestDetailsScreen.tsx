import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  StatusBar,
  Switch,
} from "react-native";
import { useTranslation } from "react-i18next";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";
import Ionicons from "react-native-vector-icons/Ionicons";
import MessageModal from "../MessageModal";
import {
  approveVehicleUpdateRequest,
  getVehicleUpdateRequest,
  rejectVehicleUpdateRequest,
  DriverVehicleUpdateRequest,
} from "../../api/driverVehicleRequests";
import { getDriverProfile } from "../../api/profileApi";
import AttachmentPreview from "../../components/driver/AttachmentPreview";

const DARK_TEAL = "#0f5b63";

type Props = NativeStackScreenProps<
  RootStackParamList,
  "AdminVehicleUpdateRequestDetails"
>;

export default function AdminVehicleUpdateRequestDetailsScreen({
  route,
  navigation,
}: Props) {
  const { t } = useTranslation();
  const { adminUserId, requestId } = route.params;
  const [req, setReq] = useState<DriverVehicleUpdateRequest | null>(null);
  const [currentVehicle, setCurrentVehicle] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rejectVisible, setRejectVisible] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [canContinueDriving, setCanContinueDriving] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getVehicleUpdateRequest(requestId);
      setReq(data);
      try {
        const profile = await getDriverProfile(data.driver_user_id);
        if (profile.vehicle) {
          setCurrentVehicle(
            `${profile.vehicle.car_type} · ${profile.vehicle.plate_number} · ${profile.vehicle.production_year}`
          );
        } else {
          setCurrentVehicle(t("no_vehicle_info") || "—");
        }
      } catch {
        setCurrentVehicle("—");
      }
    } catch {
      setReq(null);
    } finally {
      setLoading(false);
    }
  }, [requestId, t]);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleApprove = async () => {
    setBusy(true);
    try {
      await approveVehicleUpdateRequest(requestId, adminUserId);
      setSuccessMsg(t("vehicle_request_approved") || "הבקשה אושרה");
      setSuccessVisible(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t("unknown_error");
      setSuccessMsg(msg);
      setSuccessVisible(true);
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) return;
    setBusy(true);
    try {
      await rejectVehicleUpdateRequest(
        requestId,
        adminUserId,
        rejectReason.trim(),
        canContinueDriving
      );
      setRejectVisible(false);
      setSuccessMsg(t("vehicle_request_rejected") || "הבקשה נדחתה");
      setSuccessVisible(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t("unknown_error");
      setSuccessMsg(msg);
      setSuccessVisible(true);
    } finally {
      setBusy(false);
    }
  };

  if (loading || !req) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={DARK_TEAL} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-forward" size={24} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{req.driver_full_name || t("driver")}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.meta}>{req.driver_email} · {req.driver_phone}</Text>
        <Text style={styles.type}>
          {req.request_type === "ADD_NEW"
            ? t("add_new_vehicle")
            : t("update_existing_vehicle")}
        </Text>

        {req.request_type === "UPDATE_EXISTING" ? (
          <View style={styles.compareBox}>
            <Text style={styles.compareTitle}>{t("current_vehicle") || "רכב נוכחי"}</Text>
            <Text>{currentVehicle}</Text>
          </View>
        ) : null}

        {req.message_to_admin ? (
          <View style={styles.box}>
            <Text style={styles.boxTitle}>{t("message_to_admin")}</Text>
            <Text>{req.message_to_admin}</Text>
          </View>
        ) : null}

        <View style={styles.box}>
          <Text style={styles.boxTitle}>{t("requested_vehicle") || "רכב מבוקש"}</Text>
          <Text>{req.car_type} · {req.plate_number} · {req.production_year}</Text>
        </View>

        <Text style={styles.docLabel}>{t("driver_license")}</Text>
        <AttachmentPreview url={req.driver_license_image_url} imageStyle={styles.doc} />
        <Text style={styles.docLabel}>{t("car_license")}</Text>
        <AttachmentPreview url={req.car_license_image_url} imageStyle={styles.doc} />
        <Text style={styles.docLabel}>{t("car_insurance")}</Text>
        <AttachmentPreview url={req.car_insurance_image_url} imageStyle={styles.doc} />
        {(req.car_photos_urls || []).map((url, i) => (
          <View key={i}>
            <Text style={styles.docLabel}>
              {t("car_photo")} {i + 1}
            </Text>
            <AttachmentPreview url={url} imageStyle={styles.doc} />
          </View>
        ))}

        <View style={styles.actions}>
          <TouchableOpacity style={styles.approveBtn} onPress={handleApprove} disabled={busy}>
            <Text style={styles.approveText}>{t("approve") || "אשר"}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.rejectBtn} onPress={() => setRejectVisible(true)} disabled={busy}>
            <Text style={styles.rejectText}>{t("reject") || "דחה"}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal visible={rejectVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t("rejection_reason")}</Text>
            <TextInput
              style={styles.modalInput}
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              placeholder={t("enter_rejection_reason") || "סיבת דחייה"}
            />
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>
                {t("can_continue_driving_label") ||
                  "הנהג יכול להמשיך לנסוע עם הרכב הקיים"}
              </Text>
              <Switch value={canContinueDriving} onValueChange={setCanContinueDriving} />
            </View>
            <TouchableOpacity style={styles.approveBtn} onPress={handleReject} disabled={busy}>
              <Text style={styles.approveText}>{t("confirm_reject") || "אשר דחייה"}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setRejectVisible(false)}>
              <Text style={styles.cancelText}>{t("cancel")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <MessageModal
        visible={successVisible}
        type="success"
        title={t("success") || "הצלחה"}
        message={successMsg}
        onClose={() => {
          setSuccessVisible(false);
          navigation.goBack();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: "#eee" },
  headerTitle: { fontSize: 18, fontWeight: "700", color: DARK_TEAL },
  scroll: { padding: 16, paddingBottom: 40 },
  meta: { color: "#666", marginBottom: 8 },
  type: { fontWeight: "700", color: DARK_TEAL, marginBottom: 12 },
  compareBox: { backgroundColor: "#f0f4f5", padding: 12, borderRadius: 10, marginBottom: 12 },
  compareTitle: { fontWeight: "700", marginBottom: 4 },
  box: { backgroundColor: "#f5fdff", padding: 12, borderRadius: 10, marginBottom: 12 },
  boxTitle: { fontWeight: "700", color: DARK_TEAL, marginBottom: 4 },
  docLabel: { fontWeight: "600", color: DARK_TEAL, marginTop: 8, marginBottom: 6 },
  doc: { width: "100%", height: 140, borderRadius: 8, marginBottom: 10, backgroundColor: "#eee" },
  actions: { flexDirection: "row", gap: 12, marginTop: 16 },
  approveBtn: { flex: 1, backgroundColor: DARK_TEAL, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  approveText: { color: "#fff", fontWeight: "700" },
  rejectBtn: { flex: 1, backgroundColor: "#d7263d", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  rejectText: { color: "#fff", fontWeight: "700" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: "#fff", borderRadius: 16, padding: 20 },
  modalTitle: { fontWeight: "700", fontSize: 16, marginBottom: 10, color: DARK_TEAL },
  modalInput: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, minHeight: 80, padding: 10, textAlignVertical: "top", marginBottom: 12 },
  switchRow: { flexDirection: "row", alignItems: "center", marginBottom: 16, gap: 8 },
  switchLabel: { flex: 1, color: "#333" },
  cancelText: { textAlign: "center", marginTop: 12, color: DARK_TEAL },
});
