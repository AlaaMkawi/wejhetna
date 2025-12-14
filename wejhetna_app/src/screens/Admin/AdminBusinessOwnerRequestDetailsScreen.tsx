// src/screens/Admin/AdminBusinessOwnerRequestDetailsScreen.tsx

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
  ActivityIndicator,
  Image,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";

const API_BASE_URL = "http://10.0.2.2:8000";

type Props = NativeStackScreenProps<RootStackParamList, "AdminBusinessOwnerRequestDetails">;

export default function AdminBusinessOwnerRequestDetailsScreen({ route, navigation }: Props) {
  const { adminUserId, request } = route.params;
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [processing, setProcessing] = useState(false);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "PENDING":
        return "#FFA500";
      case "APPROVED":
        return "#4CAF50";
      case "REJECTED":
        return "#F44336";
      default:
        return "#757575";
    }
  };

  const handleApprove = async () => {
    Alert.alert(
      "Approve Request",
      "Are you sure you want to approve this business owner request? The location will be added to the map.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Approve",
          style: "default",
          onPress: async () => {
            try {
              setProcessing(true);
              const res = await fetch(
                `${API_BASE_URL}/admin/business-owner/requests/${request.id}/approve`,
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
                Alert.alert("Error", json.detail || "Failed to approve request");
              } else {
                Alert.alert("Success", "Business owner request approved. The location has been added to the map.", [
                  { text: "OK", onPress: () => navigation.goBack() },
                ]);
              }
            } catch (e: any) {
              Alert.alert("Network Error", e.message || "Failed to approve request");
            } finally {
              setProcessing(false);
            }
          },
        },
      ]
    );
  };

  const handleReject = () => {
    setRejectModalVisible(true);
  };

  const handleRejectConfirm = async () => {
    if (!rejectReason.trim()) {
      Alert.alert("Missing Reason", "Please provide a reason for rejection.");
      return;
    }

    try {
      setProcessing(true);
      const res = await fetch(
        `${API_BASE_URL}/admin/business-owner/requests/${request.id}/reject`,
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
        Alert.alert("Error", json.detail || "Failed to reject request");
      } else {
        setRejectModalVisible(false);
        setRejectReason("");
        Alert.alert("Done", "Request rejected. The user has been notified via email.", [
          { text: "OK", onPress: () => navigation.goBack() },
        ]);
      }
    } catch (e: any) {
      Alert.alert("Network Error", e.message || "Failed to reject request");
    } finally {
      setProcessing(false);
    }
  };

  const canReview = request.status === "PENDING";

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Status Badge */}
        <View style={styles.statusContainer}>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: getStatusColor(request.status) + "20", borderColor: getStatusColor(request.status) },
            ]}
          >
            <Text style={[styles.statusText, { color: getStatusColor(request.status) }]}>
              {request.status}
            </Text>
          </View>
        </View>

        {/* Business Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Business Information</Text>
          
          <View style={styles.infoRow}>
            <Text style={styles.label}>Business Name (English):</Text>
            <Text style={styles.value}>{request.name}</Text>
          </View>

          {request.name_ar && (
            <View style={styles.infoRow}>
              <Text style={styles.label}>Business Name (Arabic):</Text>
              <Text style={[styles.value, styles.rtlText]}>
                {request.name_ar}
              </Text>
            </View>
          )}

          {request.name_he && (
            <View style={styles.infoRow}>
              <Text style={styles.label}>Business Name (Hebrew):</Text>
              <Text style={[styles.value, styles.rtlText]}>
                {request.name_he}
              </Text>
            </View>
          )}

          {request.phone && (
            <View style={styles.infoRow}>
              <Text style={styles.label}>Phone:</Text>
              <Text style={styles.value}>{request.phone}</Text>
            </View>
          )}

          {request.description && (
            <View style={styles.infoRow}>
              <Text style={styles.label}>Description:</Text>
              <Text style={styles.value}>{request.description}</Text>
            </View>
          )}

          {request.opening_hours && (
            <View style={styles.infoRow}>
              <Text style={styles.label}>Opening Hours:</Text>
              <Text style={styles.value}>{request.opening_hours}</Text>
            </View>
          )}

          {request.social_media_account_name && (
            <View style={styles.infoRow}>
              <Text style={styles.label}>Social Media Account:</Text>
              <Text style={styles.value}>{request.social_media_account_name}</Text>
            </View>
          )}

          {request.main_image_url && (
            <View style={styles.infoRow}>
              <Text style={styles.label}>Main Image:</Text>
              <Image
                source={{ uri: request.main_image_url }}
                style={styles.detailImage}
              />
            </View>
          )}

          {request.business_license_image_url && (
            <View style={styles.infoRow}>
              <Text style={styles.label}>📄 Business License:</Text>
              <Image
                source={{ uri: request.business_license_image_url }}
                style={styles.detailImage}
              />
            </View>
          )}

          {request.business_images_urls && request.business_images_urls.length > 0 && (
            <View style={styles.infoRow}>
              <Text style={styles.label}>📷 Business Pictures ({request.business_images_urls.length}):</Text>
              <View style={styles.imagesGrid}>
                {request.business_images_urls.map((url, index) => (
                  <View key={index} style={styles.imageWrapper}>
                    <Image
                      source={{ uri: url }}
                      style={styles.detailImageGrid}
                    />
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* Location Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Location Information</Text>
          
          <View style={styles.infoRow}>
            <Text style={styles.label}>Latitude:</Text>
            <Text style={styles.value}>{request.lat.toFixed(6)}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.label}>Longitude:</Text>
            <Text style={styles.value}>{request.lon.toFixed(6)}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.label}>Source:</Text>
            <Text style={styles.value}>{request.source}</Text>
          </View>

          {request.existing_place_id ? (
            <View style={styles.infoRow}>
              <Text style={styles.label}>Type:</Text>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>📍 Claiming Existing Place</Text>
              </View>
            </View>
          ) : (
            <View style={styles.infoRow}>
              <Text style={styles.label}>Type:</Text>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>➕ New Place Request</Text>
              </View>
            </View>
          )}
        </View>

        {/* Request Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Request Details</Text>
          
          <View style={styles.infoRow}>
            <Text style={styles.label}>Request ID:</Text>
            <Text style={styles.value}>#{request.id}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.label}>User ID:</Text>
            <Text style={styles.value}>#{request.user_id}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.label}>Submitted:</Text>
            <Text style={styles.value}>{formatDate(request.created_at)}</Text>
          </View>

          {request.reviewed_at && (
            <View style={styles.infoRow}>
              <Text style={styles.label}>Reviewed:</Text>
              <Text style={styles.value}>{formatDate(request.reviewed_at)}</Text>
            </View>
          )}

          {request.rejection_reason && (
            <View style={styles.infoRow}>
              <Text style={styles.label}>Rejection Reason:</Text>
              <Text style={[styles.value, styles.rejectionReason]}>{request.rejection_reason}</Text>
            </View>
          )}
        </View>

        {/* Action Buttons */}
        {canReview && (
          <View style={styles.actionsContainer}>
            <TouchableOpacity
              style={[styles.actionButton, styles.approveButton]}
              onPress={handleApprove}
              disabled={processing}
            >
              {processing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.actionButtonText}>✓ Approve Request</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.rejectButton]}
              onPress={handleReject}
              disabled={processing}
            >
              <Text style={styles.actionButtonText}>✗ Reject Request</Text>
            </TouchableOpacity>
          </View>
        )}

        {!canReview && (
          <View style={styles.actionsContainer}>
            <Text style={styles.reviewedText}>
              This request has already been {request.status.toLowerCase()}.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Reject Modal */}
      <Modal
        visible={rejectModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setRejectModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Reject Request</Text>
            <Text style={styles.modalSubtitle}>
              Please provide a reason for rejection. This will be sent to the user via email.
            </Text>

            <TextInput
              style={styles.reasonInput}
              placeholder="Enter rejection reason..."
              placeholderTextColor="#999"
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={() => {
                  setRejectModalVisible(false);
                  setRejectReason("");
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.modalConfirmButton]}
                onPress={handleRejectConfirm}
                disabled={processing || !rejectReason.trim()}
              >
                {processing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalConfirmText}>Reject</Text>
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
  container: {
    flex: 1,
    backgroundColor: "#F7F7FB",
  },
  scrollContent: {
    padding: 16,
  },
  statusContainer: {
    alignItems: "center",
    marginBottom: 24,
  },
  statusBadge: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 2,
  },
  statusText: {
    fontSize: 14,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  section: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1B1338",
    marginBottom: 16,
    borderBottomWidth: 2,
    borderBottomColor: "#ED1C7B",
    paddingBottom: 8,
  },
  infoRow: {
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
    marginBottom: 4,
  },
  value: {
    fontSize: 16,
    color: "#333",
    lineHeight: 22,
  },
  badge: {
    backgroundColor: "#E3F2FD",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    alignSelf: "flex-start",
  },
  badgeText: {
    fontSize: 12,
    color: "#1976D2",
    fontWeight: "600",
  },
  rejectionReason: {
    color: "#F44336",
    fontStyle: "italic",
  },
  actionsContainer: {
    marginTop: 8,
    marginBottom: 24,
  },
  actionButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  rtlText: {
    textAlign: "right",
  },
  approveButton: {
    backgroundColor: "#4CAF50",
  },
  rejectButton: {
    backgroundColor: "#F44336",
  },
  actionButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  reviewedText: {
    textAlign: "center",
    fontSize: 14,
    color: "#999",
    fontStyle: "italic",
    padding: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 24,
    width: "90%",
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1B1338",
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: "#666",
    marginBottom: 20,
    lineHeight: 20,
  },
  reasonInput: {
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    minHeight: 100,
    backgroundColor: "#F5F5F5",
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginHorizontal: 6,
  },
  modalCancelButton: {
    backgroundColor: "#F5F5F5",
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  modalConfirmButton: {
    backgroundColor: "#F44336",
  },
  modalCancelText: {
    color: "#666",
    fontSize: 16,
    fontWeight: "600",
  },
  modalConfirmText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  detailImage: {
    width: "100%",
    height: 250,
    borderRadius: 12,
    marginTop: 12,
    resizeMode: "cover",
    backgroundColor: "#F0F0F0",
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
    backgroundColor: "#F0F0F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  detailImageGrid: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
});

