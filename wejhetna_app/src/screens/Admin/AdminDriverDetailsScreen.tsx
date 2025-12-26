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
  Image,
  StatusBar,
  Platform,
} from "react-native";
import { useTranslation } from "react-i18next";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";

const API_BASE_URL = "http://10.0.2.2:8000";
const DARK_TEAL = "#0f5b63";

type Props = NativeStackScreenProps<RootStackParamList, "AdminDriverDetails">;

export default function AdminDriverDetailsScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const { adminUserId, driver } = route.params;
  const [tab, setTab] = useState<"personal" | "vehicle">("personal");
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

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
        Alert.alert(t("error"), json.detail || t("approve_failed"));
      } else {
        Alert.alert(t("success"), t("driver_approved"), [
          { text: t("ok"), onPress: () => navigation.goBack() },
        ]);
      }
    } catch (e: any) {
      Alert.alert(t("network_error"), e.message);
    }
  };

  const handleRejectConfirm = async () => {
    if (!rejectReason.trim()) {
      Alert.alert(t("missing_reason"), t("please_type_reason"));
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
        Alert.alert(t("error"), json.detail || t("reject_failed"));
      } else {
        setRejectModalVisible(false);
        setRejectReason("");
        Alert.alert(t("done") || t("success"), t("driver_rejected"), [
          { text: t("ok"), onPress: () => navigation.goBack() },
        ]);
      }
    } catch (e: any) {
      Alert.alert(t("network_error"), e.message);
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
        <View style={styles.imageRow}>
          <Text style={styles.imageLabel}>{t("id_card")}</Text>
          <Image
            source={{ uri: driver.id_card_image_url }}
            style={styles.documentImage}
          />
        </View>
      )}
      {driver.driver_license_image_url && (
        <View style={styles.imageRow}>
          <Text style={styles.imageLabel}>{t("driver_license")}</Text>
          <Image
            source={{ uri: driver.driver_license_image_url }}
            style={styles.documentImage}
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
            <Image
              source={{ uri: driver.car_license_image_url }}
              style={styles.documentImage}
            />
          </View>
        )}
        {driver.car_insurance_image_url && (
          <View style={styles.imageRow}>
            <Text style={styles.imageLabel}>{t("car_insurance")}</Text>
            <Image
              source={{ uri: driver.car_insurance_image_url }}
              style={styles.documentImage}
            />
          </View>
        )}
        {driver.car_photos_urls && driver.car_photos_urls.length > 0 && (
          <View style={styles.imageRow}>
            <Text style={styles.imageLabel}>
              {t("car_photos")} ({driver.car_photos_urls.length})
            </Text>
            <View style={styles.imagesGrid}>
              {driver.car_photos_urls.map((url, index) => (
                <View key={index} style={styles.imageWrapper}>
                  <Image
                    source={{ uri: url }}
                    style={styles.carPhotoImage}
                  />
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
      </View>

      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {tab === "personal" ? renderPersonal() : renderVehicle()}
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
});
