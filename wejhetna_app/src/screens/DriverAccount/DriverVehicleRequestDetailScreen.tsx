import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  StatusBar,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useFocusEffect, useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Ionicons from "react-native-vector-icons/Ionicons";
import { RootStackParamList } from "../../navigation/types";
import {
  DriverVehicleUpdateRequest,
  getVehicleUpdateRequest,
} from "../../api/driverVehicleRequests";
import AttachmentPreview from "../../components/driver/AttachmentPreview";

const DARK_TEAL = "#0f5b63";

type Route = RouteProp<RootStackParamList, "DriverVehicleRequestDetail">;

export default function DriverVehicleRequestDetailScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<Route>();
  const [req, setReq] = useState<DriverVehicleUpdateRequest | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getVehicleUpdateRequest(route.params.requestId);
      setReq(data);
    } catch {
      setReq(null);
    } finally {
      setLoading(false);
    }
  }, [route.params.requestId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={DARK_TEAL} />
      </View>
    );
  }

  if (!req) {
    return (
      <View style={styles.centered}>
        <Text>{t("unknown_error") || "שגיאה"}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-forward" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("request_details") || "פרטי בקשה"}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.label}>{t("status") || "סטטוס"}: {req.status}</Text>
        {req.message_to_admin ? (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>{t("message_to_admin") || "הודעה לאדמין"}</Text>
            <Text style={styles.blockBody}>{req.message_to_admin}</Text>
          </View>
        ) : null}

        <View style={styles.block}>
          <Text style={styles.blockTitle}>{t("vehicle_information") || "פרטי רכב"}</Text>
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

        {req.status === "REJECTED" && req.rejection_reason ? (
          <View style={[styles.block, styles.rejectBlock]}>
            <Text style={styles.blockTitle}>{t("rejection_reason") || "סיבת דחייה"}</Text>
            <Text style={styles.blockBody}>{req.rejection_reason}</Text>
            {req.can_continue_driving ? (
              <Text style={styles.hintOk}>
                {t("can_continue_driving_hint") ||
                  "ניתן להמשיך לבצע נסיעות עם הרכב הקיים בזמן תיקון הבקשה."}
              </Text>
            ) : (
              <Text style={styles.hintBad}>
                {t("cannot_drive_until_approved") ||
                  "אינך יכול לבצע נסיעות עד שהבקשה תאושר. אנא שלח בקשה מתוקנת."}
              </Text>
            )}
            <TouchableOpacity
              style={styles.resubmitBtn}
              onPress={() => navigation.navigate("DriverVehicleUpdateRequest")}
            >
              <Text style={styles.resubmitText}>{t("submit_corrected_request") || "שלח בקשה מתוקנת"}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: "#eee" },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "700", color: DARK_TEAL },
  headerSpacer: { width: 32 },
  scroll: { padding: 16, paddingBottom: 40 },
  label: { fontWeight: "700", color: DARK_TEAL, marginBottom: 12 },
  block: { marginBottom: 16, padding: 12, backgroundColor: "#f5fdff", borderRadius: 10 },
  rejectBlock: { backgroundColor: "#fff5f5", borderWidth: 1, borderColor: "#ffd6d6" },
  blockTitle: { fontWeight: "700", color: DARK_TEAL, marginBottom: 6 },
  blockBody: { color: "#333", lineHeight: 22 },
  hintOk: { marginTop: 10, color: "#2e7d32", fontWeight: "600" },
  hintBad: { marginTop: 10, color: "#c62828", fontWeight: "600" },
  docLabel: { fontWeight: "600", color: DARK_TEAL, marginTop: 8, marginBottom: 6 },
  doc: { width: "100%", height: 140, borderRadius: 8, marginBottom: 10, backgroundColor: "#eee" },
  resubmitBtn: { marginTop: 14, backgroundColor: DARK_TEAL, borderRadius: 20, paddingVertical: 12, alignItems: "center" },
  resubmitText: { color: "#fff", fontWeight: "700" },
});
