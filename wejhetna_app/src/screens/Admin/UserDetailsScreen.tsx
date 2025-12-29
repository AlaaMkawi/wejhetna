// src/screens/Admin/UserDetailsScreen.tsx

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StatusBar,
  Platform,
  Image,
} from "react-native";
import { useTranslation } from "react-i18next";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";

const API_BASE_URL = "http://10.0.2.2:8000";
const DARK_TEAL = "#0f5b63";

type Props = NativeStackScreenProps<RootStackParamList, "UserDetails">;

type DriverProfileData = {
  user: any;
  vehicle: {
    id: number;
    car_type: string;
    plate_number: string;
    production_year: number;
    car_license_image_url: string;
    car_insurance_image_url: string;
    car_photos_urls?: string[] | null;
    status: string;
  } | null;
  driver_status: string;
  driver_license_image_url?: string | null;
  id_card_image_url?: string | null;
};

type BusinessOwnerProfileData = {
  user: any;
  place: {
    id: number;
    name: string;
    name_ar?: string | null;
    name_he?: string | null;
    city_name?: string | null;
    category_name?: string | null;
    description?: string | null;
    phone?: string | null;
    opening_hours?: string | null;
    main_image_url?: string | null;
    lat?: number | null;
    lon?: number | null;
  } | null;
  request_status?: string | null;
};

export default function UserDetailsScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const { adminUserId, user } = route.params;
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [driverData, setDriverData] = useState<DriverProfileData | null>(null);
  const [businessData, setBusinessData] = useState<BusinessOwnerProfileData | null>(null);
  const [tab, setTab] = useState<"personal" | "vehicle" | "business">("personal");


  const loadDriverProfile = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/users/${user.id}/driver-profile`);
      const data = await res.json();
      if (res.ok) {
        setDriverData(data);
      }
    } catch (e: any) {
      console.error("Error loading driver profile:", e);
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  const loadBusinessOwnerProfile = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/users/${user.id}/business-owner-profile`);
      const data = await res.json();
      if (res.ok) {
        setBusinessData(data);
      }
    } catch (e: any) {
      console.error("Error loading business owner profile:", e);
    } finally {
      setLoading(false);
    }
  }, [user.id]);
  
  useEffect(() => {
    if (user.role === "DRIVER") {
      loadDriverProfile();
    } else if (user.role === "BUSINESS_OWNER") {
      loadBusinessOwnerProfile();
    }
  }, [
    user.role,
    loadDriverProfile,
    loadBusinessOwnerProfile,
  ]);

  const getRoleColor = (userRole: string) => {
    switch (userRole) {
      case "REGULAR":
        return "#2196F3";
      case "BUSINESS_OWNER":
        return "#FF9800";
      case "DRIVER":
        return "#4CAF50";
      case "ADMIN":
        return "#9C27B0";
      default:
        return "#757575";
    }
  };

  const getStatusTranslation = (status: string) => {
    switch (status.toUpperCase()) {
      case "ACTIVE":
        return t("active") || status;
      case "PENDING":
        return t("pending");
      case "REJECTED":
        return t("rejected");
      case "APPROVED":
        return t("approved");
      case "SUBMITTED":
        return t("submitted") || status;
      default:
        return status;
    }
  };

  const getRoleTranslation = (role: string) => {
    switch (role) {
      case "REGULAR":
        return t("regular") || role;
      case "BUSINESS_OWNER":
        return t("business_owner") || role;
      case "DRIVER":
        return t("driver") || role;
      case "ADMIN":
        return t("admin") || role;
      default:
        return role;
    }
  };

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

  const handleDeleteUser = () => {
    const isBusinessOwner = user.role === "BUSINESS_OWNER";
    const message = isBusinessOwner
      ? t("remove_business_owner_message") || `Remove ${user.full_name}? Their account will be set to PENDING (cannot log in), but their business places will remain on the map.`
      : t("delete_user_message") || `Are you sure you want to permanently delete ${user.full_name}? This action cannot be undone.`;

    Alert.alert(
      isBusinessOwner ? t("remove_business_owner") || "Remove Business Owner" : t("delete_user") || "Delete User",
      message,
      [
        { text: t("cancel") || "Cancel", style: "cancel" },
        {
          text: isBusinessOwner ? t("remove") || "Remove" : t("delete") || "Delete",
          style: "destructive",
          onPress: confirmDeleteUser,
        },
      ]
    );
  };

  const confirmDeleteUser = async () => {
    try {
      setDeleting(true);
      const res = await fetch(
        `${API_BASE_URL}/admin/users/${user.id}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            admin_user_id: adminUserId,
          }),
        }
      );

      const responseText = await res.text();
      let json;
      try {
        json = JSON.parse(responseText);
      } catch {
        Alert.alert(t("error") || "Error", `Server error: ${responseText.substring(0, 100)}`);
        return;
      }

      if (!res.ok) {
        Alert.alert(t("error") || "Error", json.detail || t("delete_failed") || "Failed to delete user");
      } else {
        Alert.alert(
          t("success") || "Success",
          user.role === "BUSINESS_OWNER"
            ? t("business_owner_removed") || "Business owner removed. Their places remain on the map."
            : t("user_deleted") || "User deleted successfully.",
          [
            { text: t("ok") || "OK", onPress: () => navigation.goBack() },
          ]
        );
      }
    } catch (e: any) {
      Alert.alert(t("error") || "Error", t("network_error") || "Network error: " + e.message);
    } finally {
      setDeleting(false);
    }
  };

  const renderPersonalInfo = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t("personal_info") || "Personal Information"}</Text>
      
      <View style={styles.infoCard}>
        <Text style={styles.infoLabel}>{t("full_name") || "Full Name"}</Text>
        <Text style={styles.infoValue}>{user.full_name}</Text>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoLabel}>{t("username") || "Username"}</Text>
        <Text style={styles.infoValue}>@{user.username}</Text>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoLabel}>{t("email") || "Email"}</Text>
        <Text style={styles.infoValue}>{user.email}</Text>
      </View>

      {user.phone && (
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>{t("phone") || "Phone"}</Text>
          <Text style={styles.infoValue}>{user.phone}</Text>
        </View>
      )}

      <View style={styles.infoCard}>
        <Text style={styles.infoLabel}>{t("role") || "Role"}</Text>
        <View style={[styles.roleBadge, { backgroundColor: getRoleColor(user.role) + "20", borderColor: getRoleColor(user.role) }]}>
          <Text style={[styles.roleText, { color: getRoleColor(user.role) }]}>
            {getRoleTranslation(user.role)}
          </Text>
        </View>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoLabel}>{t("status") || "Status"}</Text>
        <View style={[
          styles.statusBadge,
          user.status === "ACTIVE" && styles.statusBadgeActive,
          user.status === "PENDING" && styles.statusBadgePending,
          user.status === "REJECTED" && styles.statusBadgeRejected,
        ]}>
          <Text style={styles.statusText}>
            {getStatusTranslation(user.status)}
          </Text>
        </View>
      </View>

      {driverData && (
        <>
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>{t("driver_status") || "Driver Status"}</Text>
            <View style={[
              styles.statusBadge,
              driverData.driver_status === "PENDING" && styles.statusBadgePending,
              driverData.driver_status === "APPROVED" && styles.statusBadgeApproved,
              driverData.driver_status === "REJECTED" && styles.statusBadgeRejected,
              (driverData.driver_status === "SUBMITTED" || driverData.driver_status === "submitted") && styles.statusBadgeSubmitted,
            ]}>
              <Text style={styles.statusText}>
                {getStatusTranslation(driverData.driver_status)}
              </Text>
            </View>
          </View>

          <Text style={styles.sectionTitleSpaced}>{t("id_license") || "ID & License"}</Text>
          {driverData.id_card_image_url && (
            <View style={styles.imageRow}>
              <Text style={styles.imageLabel}>{t("id_card") || "ID Card"}</Text>
              <Image
                source={{ uri: driverData.id_card_image_url }}
                style={styles.documentImage}
              />
            </View>
          )}
          {driverData.driver_license_image_url && (
            <View style={styles.imageRow}>
              <Text style={styles.imageLabel}>{t("driver_license") || "Driver License"}</Text>
              <Image
                source={{ uri: driverData.driver_license_image_url }}
                style={styles.documentImage}
              />
            </View>
          )}
        </>
      )}

      <View style={styles.infoCard}>
        <Text style={styles.infoLabel}>{t("created_at") || "Created At"}</Text>
        <Text style={styles.infoValue}>{formatDate(user.created_at)}</Text>
      </View>
    </View>
  );

  const renderVehicleInfo = () => {
    if (!driverData || !driverData.vehicle) {
      return (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("car_info") || "Car Information"}</Text>
          <Text style={styles.emptyText}>{t("no_vehicle_info") || "No vehicle information available."}</Text>
        </View>
      );
    }

    const vehicle = driverData.vehicle;

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("car_info") || "Car Information"}</Text>
        
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>{t("car_type") || "Car Type"}</Text>
          <Text style={styles.infoValue}>{vehicle.car_type}</Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>{t("plate_number") || "Plate Number"}</Text>
          <Text style={styles.infoValue}>{vehicle.plate_number}</Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>{t("production_year") || "Production Year"}</Text>
          <Text style={styles.infoValue}>{vehicle.production_year}</Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>{t("vehicle_status") || "Vehicle Status"}</Text>
          <View style={[
            styles.statusBadge,
            vehicle.status === "PENDING" && styles.statusBadgePending,
            vehicle.status === "APPROVED" && styles.statusBadgeApproved,
            vehicle.status === "REJECTED" && styles.statusBadgeRejected,
            (vehicle.status === "SUBMITTED" || vehicle.status === "submitted") && styles.statusBadgeSubmitted,
          ]}>
            <Text style={styles.statusText}>
              {getStatusTranslation(vehicle.status)}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitleSpaced}>{t("car_documents") || "Car Documents"}</Text>
        {vehicle.car_license_image_url && (
          <View style={styles.imageRow}>
            <Text style={styles.imageLabel}>{t("car_license") || "Car License"}</Text>
            <Image
              source={{ uri: vehicle.car_license_image_url }}
              style={styles.documentImage}
            />
          </View>
        )}
        {vehicle.car_insurance_image_url && (
          <View style={styles.imageRow}>
            <Text style={styles.imageLabel}>{t("car_insurance") || "Car Insurance"}</Text>
            <Image
              source={{ uri: vehicle.car_insurance_image_url }}
              style={styles.documentImage}
            />
          </View>
        )}
        {vehicle.car_photos_urls && vehicle.car_photos_urls.length > 0 && (
          <View style={styles.imageRow}>
            <Text style={styles.imageLabel}>{t("car_photos") || "Car Photos"}</Text>
            <View style={styles.imagesGrid}>
              {vehicle.car_photos_urls.map((photoUrl, index) => (
                <Image
                  key={index}
                  source={{ uri: photoUrl }}
                  style={styles.carPhotoImage}
                />
              ))}
            </View>
          </View>
        )}
      </View>
    );
  };

  const renderBusinessInfo = () => {
    if (!businessData || !businessData.place) {
      return (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("business_info") || "Business Information"}</Text>
          <Text style={styles.emptyText}>{t("no_business_info") || "No business information available."}</Text>
        </View>
      );
    }

    const place = businessData.place;

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("business_info") || "Business Information"}</Text>
        
        {place.main_image_url && (
          <View style={styles.imageRow}>
            <Text style={styles.imageLabel}>{t("main_image") || "Main Image"}</Text>
            <Image
              source={{ uri: place.main_image_url }}
              style={styles.documentImage}
            />
          </View>
        )}

        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>{t("name") || "Name"}</Text>
          <Text style={styles.infoValue}>{place.name}</Text>
        </View>

        {place.name_ar && (
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>{t("name_ar") || "Name (Arabic)"}</Text>
            <Text style={styles.infoValue}>{place.name_ar}</Text>
          </View>
        )}

        {place.name_he && (
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>{t("name_he") || "Name (Hebrew)"}</Text>
            <Text style={styles.infoValue}>{place.name_he}</Text>
          </View>
        )}

        {place.city_name && (
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>{t("city") || "City"}</Text>
            <Text style={styles.infoValue}>{place.city_name}</Text>
          </View>
        )}

        {place.category_name && (
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>{t("category") || "Category"}</Text>
            <Text style={styles.infoValue}>{place.category_name}</Text>
          </View>
        )}

        {place.description && (
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>{t("description") || "Description"}</Text>
            <Text style={styles.infoValue}>{place.description}</Text>
          </View>
        )}

        {place.phone && (
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>{t("phone") || "Phone"}</Text>
            <Text style={styles.infoValue}>{place.phone}</Text>
          </View>
        )}

        {place.opening_hours && (
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>{t("opening_hours") || "Opening Hours"}</Text>
            <Text style={styles.infoValue}>{place.opening_hours}</Text>
          </View>
        )}

        {businessData.request_status && (
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>{t("request_status") || "Request Status"}</Text>
            <View style={[
              styles.statusBadge,
              businessData.request_status === "PENDING" && styles.statusBadgePending,
              businessData.request_status === "APPROVED" && styles.statusBadgeApproved,
              businessData.request_status === "REJECTED" && styles.statusBadgeRejected,
            ]}>
              <Text style={styles.statusText}>
                {getStatusTranslation(businessData.request_status)}
              </Text>
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Modern Centered Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{user.full_name}</Text>
      </View>

      {/* Tabs for Driver */}
      {user.role === "DRIVER" && (
        <View style={styles.tabsRow}>
          <TouchableOpacity
            style={[styles.tabButton, tab === "personal" && styles.tabButtonActive]}
            onPress={() => setTab("personal")}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabButtonText, tab === "personal" && styles.tabButtonTextActive]}>
              {t("personal_info") || "Personal"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, tab === "vehicle" && styles.tabButtonActive]}
            onPress={() => setTab("vehicle")}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabButtonText, tab === "vehicle" && styles.tabButtonTextActive]}>
              {t("car_info") || "Vehicle"}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={DARK_TEAL} />
        </View>
      ) : (
        <ScrollView 
          style={styles.scrollView} 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {user.role === "DRIVER" ? (
            tab === "personal" ? renderPersonalInfo() : renderVehicleInfo()
          ) : user.role === "BUSINESS_OWNER" ? (
            <>
              {renderPersonalInfo()}
              {renderBusinessInfo()}
            </>
          ) : (
            renderPersonalInfo()
          )}

          {/* Delete Button */}
          {user.role !== "ADMIN" && (
            <TouchableOpacity
              style={[styles.deleteButton, deleting && styles.deleteButtonDisabled]}
              onPress={handleDeleteUser}
              disabled={deleting}
              activeOpacity={0.8}
            >
              {deleting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.deleteButtonText}>
                  {user.role === "BUSINESS_OWNER" ? t("remove") || "Remove" : t("delete") || "Delete"}
                </Text>
              )}
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
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
  tabsRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 10,
    backgroundColor: "#FFFFFF",
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#E8E8E8",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
  },
  tabButtonActive: {
    backgroundColor: DARK_TEAL,
    borderColor: DARK_TEAL,
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
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
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
    fontSize: 16,
    fontWeight: "600",
    color: DARK_TEAL,
    marginTop: 20,
    marginBottom: 12,
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
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1.5,
    alignSelf: "flex-start",
    marginTop: 4,
  },
  roleText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1.5,
    alignSelf: "flex-start",
    marginTop: 4,
  },
  statusBadgeActive: {
    backgroundColor: "#E8F5E9",
    borderColor: "#4CAF50",
  },
  statusBadgePending: {
    backgroundColor: "#FFF3E0",
    borderColor: "#FFA500",
  },
  statusBadgeRejected: {
    backgroundColor: "#FFEBEE",
    borderColor: "#F44336",
  },
  statusBadgeApproved: {
    backgroundColor: "#E8F5E9",
    borderColor: "#4CAF50",
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
  imageRow: {
    marginBottom: 16,
  },
  imageLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: DARK_TEAL,
    marginBottom: 8,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  documentImage: {
    width: "100%",
    height: 200,
    borderRadius: 12,
    backgroundColor: "#F8F9FA",
    borderWidth: 0.5,
    borderColor: "#E5E7EB",
  },
  imagesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  carPhotoImage: {
    width: "48%",
    height: 150,
    borderRadius: 12,
    backgroundColor: "#F8F9FA",
    borderWidth: 0.5,
    borderColor: "#E5E7EB",
  },
  emptyText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
    padding: 20,
  },
  deleteButton: {
    backgroundColor: "#F44336",
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 18,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 20,
    shadowColor: "#F44336",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  deleteButtonDisabled: {
    opacity: 0.6,
  },
  deleteButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.3,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
});
