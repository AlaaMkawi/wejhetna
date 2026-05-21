import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Ionicons from "react-native-vector-icons/Ionicons";
import { RootStackParamList } from "../../navigation/types";
import {
  DriverVehicleUpdateRequest,
  listDriverVehicleUpdateRequests,
} from "../../api/driverVehicleRequests";

const DARK_TEAL = "#0f5b63";

function statusColor(status: string): string {
  if (status === "APPROVED") return "#4CAF50";
  if (status === "REJECTED") return "#d7263d";
  return "#f59e0b";
}

function statusLabel(status: string, t: (k: string) => string): string {
  if (status === "APPROVED") return t("request_status_approved") || "אושר";
  if (status === "REJECTED") return t("request_status_rejected") || "נדחה";
  return t("request_status_pending") || "ממתין";
}

function typeLabel(type: string, t: (k: string) => string): string {
  return type === "ADD_NEW"
    ? t("add_new_vehicle") || "הוספת רכב חדש"
    : t("update_existing_vehicle") || "עדכון רכב קיים";
}

export default function DriverVehicleRequestsListScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [requests, setRequests] = useState<DriverVehicleUpdateRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const stored = await AsyncStorage.getItem("userId");
      const userId = stored ? parseInt(stored, 10) : NaN;
      if (!Number.isFinite(userId)) {
        setRequests([]);
        return;
      }
      const list = await listDriverVehicleUpdateRequests(userId);
      setRequests(list);
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-forward" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("my_requests") || "הבקשות שלי"}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={DARK_TEAL} />
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>{t("no_vehicle_requests") || "אין בקשות רכב"}</Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() =>
                navigation.navigate("DriverVehicleRequestDetail", { requestId: item.id })
              }
            >
              <View style={styles.cardTop}>
                <Text style={styles.cardType}>{typeLabel(item.request_type, t)}</Text>
                <Text style={[styles.cardStatus, { color: statusColor(item.status) }]}>
                  {statusLabel(item.status, t)}
                </Text>
              </View>
              <Text style={styles.cardMeta}>
                {item.car_type} · {item.plate_number}
              </Text>
              <Text style={styles.cardDate}>
                {new Date(item.created_at).toLocaleString()}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafb" },
  header: { flexDirection: "row", alignItems: "center", padding: 16, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#eee" },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "700", color: DARK_TEAL },
  headerSpacer: { width: 32 },
  list: { padding: 16 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: "#e8f0f2" },
  cardTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  cardType: { fontWeight: "700", color: DARK_TEAL, flex: 1 },
  cardStatus: { fontWeight: "700", fontSize: 13 },
  cardMeta: { color: "#555", marginBottom: 4 },
  cardDate: { color: "#888", fontSize: 12 },
  empty: { textAlign: "center", color: "#888", marginTop: 40 },
});
