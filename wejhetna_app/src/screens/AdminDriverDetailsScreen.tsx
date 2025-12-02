// src/screens/AdminDriverDetailsScreen.tsx

import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";

const API_BASE_URL = "http://10.0.2.2:8000";

type Props = NativeStackScreenProps<RootStackParamList, "AdminDriverDetails">;

export default function AdminDriverDetailsScreen({ route, navigation }: Props) {
  const { adminUserId, driver } = route.params;
  const [tab, setTab] = useState<"personal" | "vehicle">("personal");
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const handleApprove = async () => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/admin/drivers/${driver.driver_profile_id}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            admin_user_id: adminUserId,
            reason: null,
          }),
        }
      );
      const json = await res.json();
      if (!res.ok) {
        Alert.alert("Error", json.detail || "Approve failed");
      } else {
        Alert.alert("Success", "Driver approved.", [
          { text: "OK", onPress: () => navigation.goBack() },
        ]);
      }
    } catch (e: any) {
      Alert.alert("Network error", e.message);
    }
  };

  const handleRejectConfirm = async () => {
    if (!rejectReason.trim()) {
      Alert.alert("Missing reason", "Please type a reason for rejection.");
      return;
    }
    try {
      const res = await fetch(
        `${API_BASE_URL}/admin/drivers/${driver.driver_profile_id}/reject`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            admin_user_id: adminUserId,
            reason: rejectReason.trim(),
          }),
        }
      );
      const json = await res.json();
      if (!res.ok) {
        Alert.alert("Error", json.detail || "Reject failed");
      } else {
        setRejectModalVisible(false);
        setRejectReason("");
        Alert.alert("Done", "Driver rejected.", [
          { text: "OK", onPress: () => navigation.goBack() },
        ]);
      }
    } catch (e: any) {
      Alert.alert("Network error", e.message);
    }
  };

  const renderPersonal = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Personal info</Text>
      <Text style={styles.row}>
        <Text style={styles.label}>Full name: </Text>
        {driver.full_name}
      </Text>
      <Text style={styles.row}>
        <Text style={styles.label}>Email: </Text>
        {driver.email}
      </Text>
      <Text style={styles.row}>
        <Text style={styles.label}>Phone: </Text>
        {driver.phone}
      </Text>
      <Text style={styles.row}>
        <Text style={styles.label}>Driver status: </Text>
        {driver.driver_status}
      </Text>
      <Text style={styles.row}>
        <Text style={styles.label}>Vehicle status: </Text>
        {driver.vehicle_status}
      </Text>

      <Text style={[styles.sectionTitle, { marginTop: 16 }]}>ID / license</Text>
      <Text style={styles.row}>
        <Text style={styles.label}>ID card image: </Text>
        {driver.id_card_image_url || "-"}
      </Text>
      <Text style={styles.row}>
        <Text style={styles.label}>Driver license image: </Text>
        {driver.driver_license_image_url || "-"}
      </Text>
    </View>
  );

  const renderVehicle = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Car info</Text>
      <Text style={styles.row}>
        <Text style={styles.label}>Type: </Text>
        {driver.car_type}
      </Text>
      <Text style={styles.row}>
        <Text style={styles.label}>Plate number: </Text>
        {driver.plate_number}
      </Text>
      <Text style={styles.row}>
        <Text style={styles.label}>Production year: </Text>
        {driver.production_year}
      </Text>

      <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Car documents</Text>
      <Text style={styles.row}>
        <Text style={styles.label}>Car license: </Text>
        {driver.car_license_image_url || "-"}
      </Text>
      <Text style={styles.row}>
        <Text style={styles.label}>Car insurance: </Text>
        {driver.car_insurance_image_url || "-"}
      </Text>
      <Text style={styles.row}>
        <Text style={styles.label}>Car photos: </Text>
        {driver.car_photos_urls && driver.car_photos_urls.length > 0
          ? driver.car_photos_urls.join(", ")
          : "-"}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Tabs like signup pages */}
      <View style={styles.tabsRow}>
        <TouchableOpacity
          style={[styles.tabButton, tab === "personal" && styles.tabButtonActive]}
          onPress={() => setTab("personal")}
        >
          <Text
            style={[
              styles.tabButtonText,
              tab === "personal" && styles.tabButtonTextActive,
            ]}
          >
            Personal
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, tab === "vehicle" && styles.tabButtonActive]}
          onPress={() => setTab("vehicle")}
        >
          <Text
            style={[
              styles.tabButtonText,
              tab === "vehicle" && styles.tabButtonTextActive,
            ]}
          >
            Car & files
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
        {tab === "personal" ? renderPersonal() : renderVehicle()}
      </ScrollView>

      {/* Approve / Reject buttons */}
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.actionButton, styles.rejectButton]}
          onPress={() => setRejectModalVisible(true)}
        >
          <Text style={styles.actionText}>Reject</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.acceptButton]}
          onPress={handleApprove}
        >
          <Text style={styles.actionText}>Accept</Text>
        </TouchableOpacity>
      </View>

      {/* Reject modal */}
      <Modal
        visible={rejectModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setRejectModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Reject reason</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Type the reason for rejection..."
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
            />
            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancel]}
                onPress={() => {
                  setRejectModalVisible(false);
                  setRejectReason("");
                }}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalConfirm]}
                onPress={handleRejectConfirm}
              >
                <Text style={styles.modalButtonText}>Reject</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F7FB" },
  tabsRow: {
    flexDirection: "row",
    margin: 16,
    backgroundColor: "#E5E5F5",
    borderRadius: 999,
    padding: 4,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 999,
    alignItems: "center",
  },
  tabButtonActive: {
    backgroundColor: "#ED1C7B",
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1B1338",
  },
  tabButtonTextActive: {
    color: "#FFF",
  },
  section: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
  },
  row: {
    marginBottom: 6,
  },
  label: {
    fontWeight: "600",
  },
  actionsRow: {
    flexDirection: "row",
    padding: 16,
    borderTopWidth: 1,
    borderColor: "#DDD",
    backgroundColor: "#FFF",
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: "center",
  },
  rejectButton: {
    backgroundColor: "#999",
    marginRight: 8,
  },
  acceptButton: {
    backgroundColor: "#28A745",
    marginLeft: 8,
  },
  actionText: {
    color: "#FFF",
    fontWeight: "700",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "85%",
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#CCC",
    borderRadius: 8,
    padding: 8,
    minHeight: 80,
    textAlignVertical: "top",
    marginBottom: 12,
  },
  modalButtonsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  modalButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginLeft: 8,
  },
  modalCancel: {
    backgroundColor: "#EEE",
  },
  modalConfirm: {
    backgroundColor: "#ED1C7B",
  },
  modalButtonText: {
    fontWeight: "600",
    color: "#1B1338",
  },
});
