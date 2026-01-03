// src/screens/Admin/AdminBusinessOwnerRequestDetailsScreen.tsx

import React, { useState, useRef, useEffect } from "react";
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
  StatusBar,
  Platform,
} from "react-native";
import { MapView, Camera, PointAnnotation } from "@maplibre/maplibre-react-native";
import { useTranslation } from "react-i18next";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";
import MessageModal from "../MessageModal";
import Ionicons from "react-native-vector-icons/Ionicons";
import { fetchCategories, Category } from "../../api/places";
import i18n from "../../i18n";

import { API_BASE_URL } from "../../../config";
const DARK_TEAL = "#0f5b63";

const MAP_STYLE_URL =
  "https://api.maptiler.com/maps/019b0319-f856-79df-b13b-917c4a28f9a8/style.json?key=Js2mV1WY15ayeXH6ceQP";

type Props = NativeStackScreenProps<RootStackParamList, "AdminBusinessOwnerRequestDetails">;

type UserInfo = {
  id: number;
  full_name: string;
  username: string;
  email: string;
  phone: string;
  role: string;
  status: string;
  created_at: string;
};
export default function AdminBusinessOwnerRequestDetailsScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const { adminUserId, request } = route.params;
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [processing, setProcessing] = useState(false);
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorModal, setErrorModal] = useState<{ visible: boolean; title: string; message: string }>({
    visible: false,
    title: "",
    message: "",
  });
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [loadingUser, setLoadingUser] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const cameraRef = useRef<any>(null);

  // Fetch user information
  useEffect(() => {
    async function loadUserInfo() {
      if (!request.user_id) return;
      
      setLoadingUser(true);
      try {
        const res = await fetch(`${API_BASE_URL}/admin/users`);
        const users = await res.json();
        if (res.ok && Array.isArray(users)) {
          const user = users.find((u: UserInfo) => u.id === request.user_id);
          if (user) {
            setUserInfo(user);
          }
        }
      } catch (error) {
        console.error("Error loading user info:", error);
      } finally {
        setLoadingUser(false);
      }
    }
    loadUserInfo();
  }, [request.user_id]);

  // Fetch categories
  useEffect(() => {
    async function loadCategories() {
      try {
        const cats = await fetchCategories();
        setCategories(cats);
      } catch (error) {
        console.error("Error loading categories:", error);
      }
    }
    loadCategories();
  }, []);

  // Initialize map camera position
  useEffect(() => {
    if (cameraRef.current && request.lat && request.lon) {
      setTimeout(() => {
        cameraRef.current?.setCamera({
          centerCoordinate: [request.lon, request.lat],
          zoomLevel: 15,
          animationDuration: 0,
        });
      }, 100);
    }
  }, [request.lat, request.lon]);

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

  // Helper function to get category name based on current language
  const getCategoryName = (category: Category | null | undefined): string => {
    if (!category) return "";
    
    const currentLanguage = i18n.language || "ar";
    
    if (currentLanguage === "he" && category.name_he) {
      return category.name_he;
    } else if (currentLanguage === "ar" && category.name_ar) {
      return category.name_ar;
    } else if (category.name_en) {
      return category.name_en;
    }
    
    return category.name_ar || category.name_he || category.name_en || "";
  };

  // Get the category for this request
  const requestCategory = request.category_id 
    ? categories.find(cat => cat.id === request.category_id)
    : null;

  const handleApprove = async () => {
    Alert.alert(
      t("accept"),
      t("approve_request_message") || "Are you sure you want to approve this business owner request?",
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("accept"),
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
                setErrorModal({
                  visible: true,
                  title: t("error") || "Error",
                  message: json.detail || t("approve_failed") || "Failed to approve business owner request",
                });
              } else {
                setSuccessMessage(t("business_request_approved") || "Business owner request approved");
                setSuccessModalVisible(true);
              }
            } catch (e: any) {
              setErrorModal({
                visible: true,
                title: t("error") || "Error",
                message: e.message || t("network_error_message") || t("network_error") || "Network error occurred",
              });
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
      Alert.alert(t("missing_reason"), t("please_type_reason"));
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
        setErrorModal({
          visible: true,
          title: t("error") || "Error",
          message: json.detail || t("reject_failed") || "Failed to reject business owner request",
        });
      } else {
        setRejectModalVisible(false);
        setRejectReason("");
        setSuccessMessage(t("business_request_rejected") || "Business owner request rejected");
        setSuccessModalVisible(true);
      }
    } catch (e: any) {
      setErrorModal({
        visible: true,
        title: t("error") || "Error",
        message: e.message || t("network_error_message") || t("network_error") || "Network error occurred",
      });
    } finally {
      setProcessing(false);
    }
  };

  const canReview = request.status === "PENDING";

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Modern Centered Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{request.name}</Text>
      </View>

      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* User Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("user_information") || "User Information"}</Text>
          
          {loadingUser ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={DARK_TEAL} />
            </View>
          ) : userInfo ? (
            <>
              <View style={styles.infoCard}>
                <Text style={styles.infoLabel}>{t("full_name") || "Full Name"}</Text>
                <Text style={styles.infoValue}>{userInfo.full_name || (t("no_data") || "No data")}</Text>
              </View>

              <View style={styles.infoCard}>
                <Text style={styles.infoLabel}>{t("username") || "Username"}</Text>
                <Text style={styles.infoValue}>{userInfo.username || (t("no_data") || "No data")}</Text>
              </View>

              <View style={styles.infoCard}>
                <Text style={styles.infoLabel}>{t("email") || "Email"}</Text>
                <Text style={styles.infoValue}>{userInfo.email || (t("no_data") || "No data")}</Text>
              </View>

              <View style={styles.infoCard}>
                <Text style={styles.infoLabel}>{t("phone") || "Phone"}</Text>
                <Text style={styles.infoValue}>{userInfo.phone || (t("no_data") || "No data")}</Text>
              </View>
            </>
          ) : (
            <View style={styles.infoCard}>
              <Text style={styles.infoValue}>{t("user_not_found") || "User information not available"}</Text>
            </View>
          )}
        </View>

        {/* Business Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("business_information")}</Text>
          
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>{t("business_name")} ({t("english")})</Text>
            <Text style={styles.infoValue}>{request.name}</Text>
          </View>

          {request.name_ar && (
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>{t("business_name")} ({t("arabic")})</Text>
              <Text style={[styles.infoValue, styles.rtlText]}>
                {request.name_ar}
              </Text>
            </View>
          )}

          {request.name_he && (
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>{t("business_name")} ({t("hebrew")})</Text>
              <Text style={[styles.infoValue, styles.rtlText]}>
                {request.name_he}
              </Text>
            </View>
          )}

          {/* Category - Always show */}
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>{t("category") || "Category"}</Text>
            <Text style={[styles.infoValue, !requestCategory && styles.noDataText]}>
              {requestCategory ? getCategoryName(requestCategory) : (t("no_data") || "No data")}
            </Text>
          </View>

          {/* Phone - Always show */}
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>{t("phone")}</Text>
            <Text style={[styles.infoValue, !request.phone && styles.noDataText]}>
              {request.phone || (t("no_data") || "No data")}
            </Text>
          </View>

          {/* Description - Always show */}
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>{t("description")}</Text>
            <Text style={[styles.infoValue, !request.description && styles.noDataText]}>
              {request.description || (t("no_data") || "No data")}
            </Text>
          </View>

          {/* Opening Hours - Always show */}
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>{t("opening_hours")}</Text>
            <Text style={[styles.infoValue, !request.opening_hours && styles.noDataText]}>
              {request.opening_hours || (t("no_data") || "No data")}
            </Text>
          </View>

          {/* Social Media Account - Always show */}
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>{t("social_media_account")}</Text>
            <Text style={[styles.infoValue, !request.social_media_account_name && styles.noDataText]}>
              {request.social_media_account_name || (t("no_data") || "No data")}
            </Text>
          </View>

          {/* Main Image - Always show */}
          <View style={styles.imageRow}>
            <Text style={styles.imageLabel}>{t("main_image") || "Main Image"}</Text>
            {request.main_image_url ? (
              <Image
                source={{ uri: request.main_image_url }}
                style={styles.documentImage}
              />
            ) : (
              <View style={styles.noImageContainer}>
                <Ionicons name="image-outline" size={40} color="#999" />
                <Text style={styles.noDataText}>{t("no_data") || "No data"}</Text>
              </View>
            )}
          </View>

          {/* Business License - Always show */}
          <View style={styles.imageRow}>
            <Text style={styles.imageLabel}>{t("business_license")}</Text>
            {request.business_license_image_url ? (
              <Image
                source={{ uri: request.business_license_image_url }}
                style={styles.documentImage}
              />
            ) : (
              <View style={styles.noImageContainer}>
                <Ionicons name="image-outline" size={40} color="#999" />
                <Text style={styles.noDataText}>{t("no_data") || "No data"}</Text>
              </View>
            )}
          </View>

          {/* Business Images - Always show */}
          <View style={styles.imageRow}>
            <Text style={styles.imageLabel}>
              {t("business_pictures")} {request.business_images_urls && request.business_images_urls.length > 0 ? `(${request.business_images_urls.length})` : ""}
            </Text>
            {request.business_images_urls && request.business_images_urls.length > 0 ? (
              <View style={styles.imagesGrid}>
                {request.business_images_urls.map((url, index) => (
                  <View key={index} style={styles.imageWrapper}>
                    <Image
                      source={{ uri: url }}
                      style={styles.carPhotoImage}
                    />
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.noImageContainer}>
                <Ionicons name="image-outline" size={40} color="#999" />
                <Text style={styles.noDataText}>{t("no_data") || "No data"}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Location Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("location")}</Text>
          
          {/* Interactive Map */}
          <View style={styles.mapContainer}>
            <MapView
              style={styles.map}
              mapStyle={MAP_STYLE_URL}
              scrollEnabled={true}
              zoomEnabled={true}
              rotateEnabled={false}
              pitchEnabled={false}
              logoEnabled={false}
              attributionEnabled={false}
            >
              <Camera
                ref={cameraRef}
                defaultSettings={{
                  centerCoordinate: [request.lon, request.lat],
                  zoomLevel: 15,
                }}
                minZoomLevel={10}
                maxZoomLevel={18}
                animationMode="flyTo"
              />
              <PointAnnotation
                id="request-location"
                coordinate={[request.lon, request.lat]}
              >
                <View style={styles.markerContainer}>
                  <View style={styles.markerPin}>
                    <Ionicons name="location" size={24} color="#FF0000" />
                  </View>
                </View>
              </PointAnnotation>
            </MapView>
          </View>

          {/* Location Details */}
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>{t("latitude")}</Text>
            <Text style={styles.infoValue}>{request.lat.toFixed(6)}</Text>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>{t("longitude")}</Text>
            <Text style={styles.infoValue}>{request.lon.toFixed(6)}</Text>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>{t("source") || "Source"}</Text>
            <Text style={styles.infoValue}>{request.source}</Text>
          </View>

          {request.existing_place_id ? (
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>{t("type") || "Type"}</Text>
              <View style={styles.statusBadge}>
                <Text style={styles.statusText}>{t("claiming_existing_place") || "Claiming Existing Place"}</Text>
              </View>
            </View>
          ) : (
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>{t("type") || "Type"}</Text>
              <View style={styles.statusBadge}>
                <Text style={styles.statusText}>{t("new_place_request") || "New Place Request"}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Request Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("request_details") || "Request Details"}</Text>
          
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>{t("request_id") || "Request ID"}</Text>
            <Text style={styles.infoValue}>#{request.id}</Text>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>{t("user_id") || "User ID"}</Text>
            <Text style={styles.infoValue}>#{request.user_id}</Text>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>{t("submitted") || "Submitted"}</Text>
            <Text style={styles.infoValue}>{formatDate(request.created_at)}</Text>
          </View>

          {request.reviewed_at && (
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>{t("reviewed") || "Reviewed"}</Text>
              <Text style={styles.infoValue}>{formatDate(request.reviewed_at)}</Text>
            </View>
          )}

          {request.rejection_reason && (
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>{t("rejection_reason") || "Rejection Reason"}</Text>
              <Text style={[styles.infoValue, styles.rejectionReason]}>{request.rejection_reason}</Text>
            </View>
          )}
        </View>

        {/* Action Buttons */}
        {canReview && (
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.actionButton, styles.rejectButton]}
              onPress={handleReject}
              disabled={processing}
              activeOpacity={0.8}
            >
              <Text style={styles.actionText}>{t("reject")}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.acceptButton]}
              onPress={handleApprove}
              disabled={processing}
              activeOpacity={0.8}
            >
              {processing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.actionText}>{t("accept")}</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {!canReview && (
          <View style={styles.actionsRow}>
            <Text style={styles.reviewedText}>
              {t("request_already_reviewed") || `This request has already been ${request.status.toLowerCase()}.`}
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
            <Text style={styles.modalTitle}>{t("reject_reason")}</Text>
            <TextInput
              style={styles.modalInput}
              placeholder={t("type_reject_reason")}
              placeholderTextColor="#94A3B8"
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              textAlignVertical="top"
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
                disabled={processing || !rejectReason.trim()}
                activeOpacity={0.8}
              >
                {processing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={[styles.modalButtonText, styles.modalConfirmText]}>
                    {t("reject")}
                  </Text>
                )}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
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
  rtlText: {
    textAlign: "right",
  },
  rejectionReason: {
    color: "#F44336",
    fontStyle: "italic",
  },

  noDataText: {
    color: "#999",
    fontStyle: "italic",
  },
  loadingContainer: {
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  noImageContainer: {
    width: "100%",
    height: 200,
    borderRadius: 12,
    backgroundColor: "#F8F9FA",
    borderWidth: 0.5,
    borderColor: "#E5E7EB",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
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
  reviewedText: {
    textAlign: "center",
    fontSize: 14,
    color: "#6B7280",
    fontStyle: "italic",
    padding: 16,
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

  mapContainer: {
    width: "100%",
    height: 200,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 16,
    backgroundColor: "#F8F9FA",
    borderWidth: 0.5,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  map: {
    width: "100%",
    height: "100%",
  },
  markerContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  markerPin: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#FF0000",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  }
});

