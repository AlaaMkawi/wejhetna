// src/screens/AdminDriversScreen.tsx
import React, { useState } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  StatusBar,
  Platform,
} from "react-native";
import { useTranslation } from "react-i18next";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { RootStackParamList } from "../../navigation/types";
import Ionicons from "react-native-vector-icons/Ionicons";

import { API_BASE_URL } from "../../../config";
const DARK_TEAL = "#0f5b63";

export type DriverApplication = {
  user_id: number;
  driver_profile_id: number;
  vehicle_id: number;
  full_name: string;
  email: string;
  phone: string;
  driver_status: string;
  vehicle_status: string;
  driver_license_image_url: string;
  id_card_image_url: string;
  car_type: string;
  plate_number: string;
  production_year: number;
  car_license_image_url: string;
  car_insurance_image_url: string;
  car_photos_urls?: string[] | null;
  /** Aggregated from DriverRating (optional so older APIs still deserialize). */
  rating_avg?: number | null;
  rating_count?: number | null;
};

type Props = NativeStackScreenProps<RootStackParamList, "AdminDrivers">;

export default function AdminDriversScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const { adminUserId, role } = route.params;

  const [drivers, setDrivers] = useState<DriverApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<"oldest" | "newest">("oldest");

  const loadPending = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/drivers/pending`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.detail || t("failed_to_load_drivers") || "Failed to load drivers");
      } else {
        setDrivers(json);
      }
    } catch (e: any) {
      setError(`${t("network_error") || "Network error"}: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Refresh data when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      loadPending();
    }, [])
  );

  const getVisibleDrivers = () => {
    let list = drivers.filter((d) =>
      d.full_name.toLowerCase().includes(search.toLowerCase())
    );

    if (sortOrder === "newest") {
      list = [...list].reverse();
    }
    return list;
  };

  const handleOpenDetails = (driver: DriverApplication) => {
    navigation.navigate("AdminDriverDetails", {
      adminUserId,
      role,
      driver,
    });
  };

  const getStatusTranslation = (status: string) => {
    switch (status) {
      case "PENDING":
        return t("pending");
      case "APPROVED":
        return t("approved");
      case "REJECTED":
        return t("rejected");
      default:
        return status;
    }
  };

  const renderItem = ({ item }: { item: DriverApplication }) => {
    return (
      <TouchableOpacity
        onPress={() => handleOpenDetails(item)}
        activeOpacity={0.9}
      >
        <View style={styles.card}>
          <View style={styles.cardContent}>
            {/* Info Section */}
            <View style={styles.infoSection}>
              <View style={styles.nameRow}>
                <Text style={styles.cardTitle}>{item.full_name}</Text>
                <View style={[
                  styles.statusBadge,
                  item.driver_status === "PENDING" && styles.statusBadgePending,
                  item.driver_status === "APPROVED" && styles.statusBadgeApproved,
                  item.driver_status === "REJECTED" && styles.statusBadgeRejected,
                ]}>
                  <Text style={styles.statusText}>
                    {getStatusTranslation(item.driver_status)}
                  </Text>
                </View>
              </View>
              <View style={styles.emailRow}>
                <Ionicons name="mail-outline" size={14} color="#6B7280" style={styles.emailIcon} />
                <Text style={styles.infoValue} numberOfLines={1}>{item.email}</Text>
              </View>

              {/* ★ average (count) chip — only shown once the driver has at least one rating */}
              {item.rating_count != null && item.rating_count > 0 ? (
                <View style={styles.ratingChip}>
                  <Ionicons name="star" size={12} color="#F59E0B" />
                  <Text style={styles.ratingChipText}>
                    {Number(item.rating_avg ?? 0).toFixed(1)}
                    <Text style={styles.ratingChipCount}>
                      {"  "}({item.rating_count})
                    </Text>
                  </Text>
                </View>
              ) : (
                <View style={[styles.ratingChip, styles.ratingChipMuted]}>
                  <Ionicons name="star-outline" size={12} color="#9CA3AF" />
                  <Text style={styles.ratingChipTextMuted}>
                    {t("admin_driver_no_ratings_short") || "No ratings yet"}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <ActivityIndicator size="large" color={DARK_TEAL} />
      </View>
    );
  }

  const visibleDrivers = getVisibleDrivers();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Modern Centered Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{t("drivers_requests")}</Text>
      </View>

      <TouchableOpacity
        style={styles.reportsEntry}
        activeOpacity={0.85}
        onPress={() => navigation.navigate("AdminDriverReports", { adminUserId, role })}
      >
        <View style={styles.reportsEntryIconWrap}>
          <Ionicons name="flag" size={20} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.reportsEntryTitle}>
            {t("admin_reports_entry_title") || "Driver reports"}
          </Text>
          <Text style={styles.reportsEntrySubtitle}>
            {t("admin_reports_entry_subtitle") ||
              "Review complaints submitted by passengers"}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#6B7280" />
      </TouchableOpacity>

      {/* Search + sort */}
      <View style={styles.filtersContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder={t("search_by_name")}
          placeholderTextColor="#94A3B8"
          value={search}
          onChangeText={setSearch}
        />

        <View style={styles.sortRow}>
          <Text style={styles.sortLabel}>{t("order")}</Text>

          <TouchableOpacity
            style={[
              styles.sortButton,
              sortOrder === "oldest" && styles.sortButtonActive,
            ]}
            onPress={() => setSortOrder("oldest")}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.sortButtonText,
                sortOrder === "oldest" && styles.sortButtonTextActive,
              ]}
            >
              {t("oldest")}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.sortButton,
              sortOrder === "newest" && styles.sortButtonActive,
            ]}
            onPress={() => setSortOrder("newest")}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.sortButtonText,
                sortOrder === "newest" && styles.sortButtonTextActive,
              ]}
            >
              {t("newest")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {visibleDrivers.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            {search ? t("no_drivers_found") : t("no_pending_drivers")}
          </Text>
        </View>
      ) : (
        <FlatList
          data={visibleDrivers}
          keyExtractor={(item) => String(item.driver_profile_id)}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
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
  reportsEntry: {
    marginTop: 12,
    marginHorizontal: 20,
    marginBottom: 4,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    backgroundColor: "#F8F9FA",
    borderWidth: 1,
    borderColor: "rgba(15,91,99,0.2)",
  },
  reportsEntryIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#c5322a",
    alignItems: "center",
    justifyContent: "center",
  },
  reportsEntryTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  reportsEntrySubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: "#6B7280",
  },
  filtersContainer: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 16,
    backgroundColor: "#FFFFFF",
  },
  searchInput: {
    borderWidth: 1,
    borderColor: "#E8E8E8",
    borderRadius: 18,
    paddingHorizontal: 20,
    paddingVertical: 14,
    marginBottom: 12,
    backgroundColor: "#F8F9FA",
    fontSize: 16,
    color: "#1A1A1A",
    fontWeight: "400",
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
    shadowColor: DARK_TEAL,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  sortRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sortLabel: {
    marginRight: 12,
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
    letterSpacing: 0.2,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  sortButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "#E8E8E8",
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  sortButtonActive: {
    backgroundColor: DARK_TEAL,
    borderColor: DARK_TEAL,
    shadowColor: DARK_TEAL,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  sortButtonText: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "600",
    letterSpacing: 0.2,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  sortButtonTextActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  card: {
    backgroundColor: "#F8F9FA",
    borderRadius: 14,
    marginBottom: 8,
    marginHorizontal: 20,
    overflow: "hidden",
    borderWidth: 0.5,
    borderColor: "#E5E7EB",
  },
  cardContent: {
    padding: 16,
    backgroundColor: "transparent",
  },
  infoSection: {
    flex: 1,
    justifyContent: "center",
  },
  nameRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#1A1A1A",
    letterSpacing: -0.2,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
    flex: 1,
    marginRight: 10,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1.5,
    minWidth: 80,
    alignItems: "center",
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
  statusText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: "#333",
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  emailRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  ratingChip: {
    marginTop: 8,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: "#FFF8E6",
    borderWidth: 1,
    borderColor: "#F7D67A",
  },
  ratingChipMuted: {
    backgroundColor: "#F3F4F6",
    borderColor: "#E5E7EB",
  },
  ratingChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#92400E",
  },
  ratingChipTextMuted: {
    fontSize: 11,
    fontWeight: "600",
    color: "#6B7280",
  },
  ratingChipCount: {
    fontWeight: "600",
    color: "#92400E",
  },
  emailIcon: {
    marginRight: 6,
  },
  infoValue: {
    fontSize: 14,
    color: "#6B7280",
    fontWeight: "400",
    lineHeight: 20,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
    flex: 1,
  },
  error: {
    color: "#F44336",
    textAlign: "center",
    margin: 8,
    fontSize: 14,
    fontWeight: "500",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    color: "#6B7280",
    textAlign: "center",
    fontWeight: "400",
    lineHeight: 24,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  listContent: {
    paddingTop: 8,
    paddingBottom: 100,
    paddingHorizontal: 0,
    backgroundColor: "#FFFFFF",
  },
});
