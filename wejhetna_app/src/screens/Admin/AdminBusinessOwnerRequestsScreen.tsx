// src/screens/Admin/AdminBusinessOwnerRequestsScreen.tsx
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

export type BusinessOwnerRequest = {
  id: number;
  user_id: number;
  existing_place_id?: number | null;
  lat: number;
  lon: number;
  source: string;
  osm_id?: string | null;
  name: string;
  name_ar: string;
  name_he: string;
  city_id: number;
  category_id?: number | null;
  description?: string | null;
  phone?: string | null;
  opening_hours?: string | null;
  main_image_url?: string | null;
  business_license_image_url?: string | null;
  business_images_urls?: string[] | null;
  social_links?: string | null;
  social_media_account_name?: string | null;
  status: string;
  rejection_reason?: string | null;
  created_at: string;
  reviewed_at?: string | null;
};

type Props = NativeStackScreenProps<RootStackParamList, "AdminBusinessOwnerRequests">;

export default function AdminBusinessOwnerRequestsScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const { adminUserId, role } = route.params;

  const [requests, setRequests] = useState<BusinessOwnerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userNamesMap, setUserNamesMap] = useState<{ [key: number]: string }>({});

  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<"oldest" | "newest">("newest");

const loadRequests = React.useCallback(async () => {
  setLoading(true);
  setError(null);
  try {
    const res = await fetch(`${API_BASE_URL}/admin/business-owner/requests`);
    const json = await res.json();

    if (!res.ok) {
      setError(json.detail || t("failed_to_load_business_owner_requests") || "Failed to load business owner requests");
    } else {
      setRequests(json);

      const userIds = [...new Set(json.map((req: BusinessOwnerRequest) => req.user_id))];

      if (userIds.length > 0) {
        try {
          const usersRes = await fetch(`${API_BASE_URL}/admin/users`);
          const users = await usersRes.json();

          if (usersRes.ok && Array.isArray(users)) {
            const namesMap: { [key: number]: string } = {};
            users.forEach((user: { id: number; full_name: string }) => {
              if (userIds.includes(user.id)) {
                namesMap[user.id] = user.full_name;
              }
            });
            setUserNamesMap(namesMap);
          }
        } catch (userError) {
          console.error("Error loading user names:", userError);
        }
      }
    }
  } catch (e: any) {
    setError(`${t("network_error") || "Network error"}: ${e.message}`);
  } finally {
    setLoading(false);
  }
}, [t]);
  // Refresh data when screen comes into focus
useFocusEffect(
  React.useCallback(() => {
    loadRequests();
  }, [loadRequests])
);

  const getVisibleRequests = () => {
    // Filter to only show PENDING requests
    let list = requests.filter((req) => req.status === "PENDING");

    // Apply search filter
    list = list.filter((req) => {
      const searchLower = search.toLowerCase();
      const userName = userNamesMap[req.user_id] || "";
      return (
        userName.toLowerCase().includes(searchLower) ||
        req.name.toLowerCase().includes(searchLower) ||
        req.name_ar.toLowerCase().includes(searchLower) ||
        req.name_he.toLowerCase().includes(searchLower)
      );
    });

    // Sort by created_at
    list = [...list].sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return sortOrder === "newest" ? dateB - dateA : dateA - dateB;
    });

    return list;
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


  const renderItem = ({ item }: { item: BusinessOwnerRequest }) => {
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.9}
        onPress={() => {
          navigation.navigate("AdminBusinessOwnerRequestDetails", {
            adminUserId,
            role,
            request: item,
          });
        }}
      >
        <View style={styles.cardContent}>
          <View style={styles.nameRow}>
            <View style={styles.titleContainer}>
              <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
              {userNamesMap[item.user_id] && (
                <Text style={styles.userName} numberOfLines={1}>
                  {t("by") || "By"}: {userNamesMap[item.user_id]}
                </Text>
              )}
            </View>
            <View style={[
              styles.statusBadge,
              item.status === "PENDING" && styles.statusBadgePending,
              item.status === "APPROVED" && styles.statusBadgeApproved,
              item.status === "REJECTED" && styles.statusBadgeRejected,
            ]}>
              <Text style={styles.statusText}>
                {getStatusTranslation(item.status)}
              </Text>
            </View>
          </View>
          {item.phone && (
            <View style={styles.emailRow}>
              <Ionicons name="call-outline" size={14} color="#6B7280" style={styles.emailIcon} />
              <Text style={styles.infoValue} numberOfLines={1}>{item.phone}</Text>
            </View>
          )}
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

  const visibleRequests = getVisibleRequests();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Modern Centered Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{t("business_owner_requests")}</Text>
      </View>

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

      {visibleRequests.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            {search ? t("no_drivers_found") : t("no_pending_drivers")}
          </Text>
        </View>
      ) : (
        <FlatList
          data={visibleRequests}
          keyExtractor={(item) => String(item.id)}
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
    padding: 18,
    backgroundColor: "transparent",
  },
  nameRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  titleContainer: {
    flex: 1,
    marginRight: 10,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#1A1A1A",
    letterSpacing: -0.2,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  userName: {
    fontSize: 13,
    fontWeight: "400",
    color: "#6B7280",
    marginTop: 4,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
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