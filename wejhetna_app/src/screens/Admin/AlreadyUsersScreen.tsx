// src/screens/Admin/AlreadyUsersScreen.tsx

import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  StatusBar,
  Platform,
} from "react-native";
import { useTranslation } from "react-i18next";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AdminTabParamList } from "../../navigation/types";
import Ionicons from "react-native-vector-icons/Ionicons";
import { API_BASE_URL } from "../../../config";

const DARK_TEAL = "#0f5b63";

export type UserListItem = {
  id: number;
  full_name: string;
  username: string;
  email: string;
  phone: string;
  role: string;
  status: string;
  created_at: string;
};

type Props = NativeStackScreenProps<AdminTabParamList, "alreadyUsers">;

type UserRoleFilter = "ALL" | "REGULAR" | "BUSINESS_OWNER" | "DRIVER";

export default function AlreadyUsersScreen({ route }: Props) {
  const { t } = useTranslation();
  const { adminUserId } = route.params;

  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRoleFilter>("ALL");
  const [deletingUserId, setDeletingUserId] = useState<number | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = roleFilter === "ALL"
        ? `${API_BASE_URL}/admin/users`
        : `${API_BASE_URL}/admin/users?role_filter=${roleFilter}`;
      
      const res = await fetch(url);
      
      // Get response text first to check what we received
      const responseText = await res.text();
      
      // Check if response is JSON
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        console.error("Non-JSON response:", responseText.substring(0, 500));
        setError(`Server error: ${responseText.substring(0, 100)}...`);
        return;
      }
      
      // Try to parse as JSON
      let json;
      try {
        json = JSON.parse(responseText);
      } catch (parseError: any) {
        console.error("JSON parse error. Response:", responseText.substring(0, 500));
        setError(`Parse error: ${parseError.message}. Response: ${responseText.substring(0, 100)}`);
        return;
      }
      
      if (!res.ok) {
        setError(json.detail || json.message || "Failed to load users");
      } else {
        setUsers(json);
      }
    } catch (e: any) {
      console.error("Error loading users:", e);
      let errorMsg = "Network error: " + (e.message || "Unknown error");
      if (e.message && e.message.includes("JSON")) {
        errorMsg = "Server error: Invalid response format. Please check the backend endpoint.";
      }
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [roleFilter]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);


  const getVisibleUsers = () => {
    return users.filter((user) =>
      user.full_name.toLowerCase().includes(search.toLowerCase()) ||
      user.username.toLowerCase().includes(search.toLowerCase()) ||
      user.email.toLowerCase().includes(search.toLowerCase())
    );
  };

  const handleDeleteUser = (user: UserListItem) => {
    const isBusinessOwner = user.role === "BUSINESS_OWNER";
    const message = isBusinessOwner
      ? `Remove ${user.full_name}? Their account will be set to PENDING (cannot log in), but their business places will remain on the map.`
      : `Are you sure you want to permanently delete ${user.full_name}? This action cannot be undone.`;

    Alert.alert(
      isBusinessOwner ? "Remove Business Owner" : "Delete User",
      message,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: isBusinessOwner ? "Remove" : "Delete",
          style: "destructive",
          onPress: () => confirmDeleteUser(user),
        },
      ]
    );
  };

  const confirmDeleteUser = async (user: UserListItem) => {
    try {
      setDeletingUserId(user.id);
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
        setError(`Server error: ${responseText.substring(0, 100)}`);
        return;
      }

      if (!res.ok) {
        setError(json.detail || "Failed to delete user");
      } else {
        // Reload users list
        await loadUsers();
        Alert.alert(
          "Success",
          user.role === "BUSINESS_OWNER"
            ? "Business owner removed. Their places remain on the map."
            : "User deleted successfully."
        );
      }
    } catch (e: any) {
      setError("Network error: " + e.message);
    } finally {
      setDeletingUserId(null);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

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
    switch (status) {
      case "ACTIVE":
        return t("active") || status;
      case "PENDING":
        return t("pending");
      case "REJECTED":
        return t("rejected");
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

  const renderItem = ({ item }: { item: UserListItem }) => (
    <View style={styles.card}>
      <View style={styles.cardContent}>
        <View style={styles.nameRow}>
          <Text style={styles.cardTitle}>{item.full_name}</Text>
          <View style={[
            styles.statusBadge,
            item.status === "ACTIVE" && styles.statusBadgeActive,
            item.status === "PENDING" && styles.statusBadgePending,
            item.status === "REJECTED" && styles.statusBadgeRejected,
          ]}>
            <Text style={styles.statusText}>
              {getStatusTranslation(item.status)}
            </Text>
          </View>
        </View>
        <View style={styles.emailRow}>
          <Ionicons name="mail-outline" size={14} color="#6B7280" style={styles.emailIcon} />
          <Text style={styles.infoValue} numberOfLines={1}>{item.email}</Text>
        </View>
        {item.phone && (
          <View style={styles.phoneRow}>
            <Ionicons name="call-outline" size={14} color="#6B7280" style={styles.phoneIcon} />
            <Text style={styles.infoValue}>{item.phone}</Text>
          </View>
        )}
        <View style={styles.metaRow}>
          <View style={[styles.roleBadge, { backgroundColor: getRoleColor(item.role) + "20", borderColor: getRoleColor(item.role) }]}>
            <Text style={[styles.roleText, { color: getRoleColor(item.role) }]}>
              {getRoleTranslation(item.role)}
            </Text>
          </View>
          <Text style={styles.dateText}>{formatDate(item.created_at)}</Text>
        </View>
      </View>

      {/* Delete Button */}
      <TouchableOpacity
        style={[styles.deleteButton, deletingUserId === item.id && styles.deleteButtonDisabled]}
        onPress={() => handleDeleteUser(item)}
        disabled={deletingUserId === item.id || item.role === "ADMIN"}
      >
        {deletingUserId === item.id ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.deleteButtonText}>
            {item.role === "BUSINESS_OWNER" ? t("remove") || "Remove" : t("delete") || "Delete"}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <ActivityIndicator size="large" color={DARK_TEAL} />
        <Text style={styles.loadingText}>{t("loading") || "Loading users..."}</Text>
      </View>
    );
  }

  const visibleUsers = getVisibleUsers();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Modern Centered Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{t("already_users") || "Already Users"}</Text>
      </View>

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Search + Filter */}
      <View style={styles.filtersContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder={t("search_by_name") || "Search by name, username, or email..."}
          placeholderTextColor="#94A3B8"
          value={search}
          onChangeText={setSearch}
        />

        <View style={styles.sortRow}>
          <Text style={styles.sortLabel}>{t("filter_by_role") || "Filter by role:"}</Text>
          <View style={styles.filterRow}>
            <TouchableOpacity
              style={[styles.sortButton, roleFilter === "ALL" && styles.sortButtonActive]}
              onPress={() => setRoleFilter("ALL")}
              activeOpacity={0.8}
            >
              <Text style={[styles.sortButtonText, roleFilter === "ALL" && styles.sortButtonTextActive]}>
                {t("all") || "All"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sortButton, roleFilter === "REGULAR" && styles.sortButtonActive]}
              onPress={() => setRoleFilter("REGULAR")}
              activeOpacity={0.8}
            >
              <Text style={[styles.sortButtonText, roleFilter === "REGULAR" && styles.sortButtonTextActive]}>
                {t("regular") || "Regular"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sortButton, roleFilter === "BUSINESS_OWNER" && styles.sortButtonActive]}
              onPress={() => setRoleFilter("BUSINESS_OWNER")}
              activeOpacity={0.8}
            >
              <Text style={[styles.sortButtonText, roleFilter === "BUSINESS_OWNER" && styles.sortButtonTextActive]}>
                {t("business") || "Business"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sortButton, roleFilter === "DRIVER" && styles.sortButtonActive]}
              onPress={() => setRoleFilter("DRIVER")}
              activeOpacity={0.8}
            >
              <Text style={[styles.sortButtonText, roleFilter === "DRIVER" && styles.sortButtonTextActive]}>
                {t("driver") || "Driver"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {visibleUsers.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            {search ? t("no_users_found") || "No users found matching your search." : t("no_users") || "No users found."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={visibleUsers}
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
  loadingText: {
    marginTop: 16,
    fontSize: 15,
    color: "#64748B",
    fontWeight: "500",
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  errorContainer: {
    backgroundColor: "#FEF2F2",
    padding: 16,
    margin: 16,
    borderRadius: 16,
    borderLeftWidth: 4,
    borderLeftColor: "#EF4444",
  },
  errorText: {
    color: "#DC2626",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
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
    flexWrap: "wrap",
  },
  sortLabel: {
    marginRight: 12,
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
    letterSpacing: 0.2,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  filterRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
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
  listContent: {
    paddingTop: 8,
    paddingBottom: 100,
    paddingHorizontal: 0,
    backgroundColor: "#FFFFFF",
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
    marginBottom: 6,
  },
  emailIcon: {
    marginRight: 6,
  },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  phoneIcon: {
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
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: "center",
  },
  roleText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  dateText: {
    fontSize: 12,
    color: "#94A3B8",
    fontWeight: "600",
    letterSpacing: 0.2,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
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
  deleteButton: {
    backgroundColor: "#F44336",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 18,
    alignItems: "center",
    marginTop: 8,
    marginHorizontal: 20,
    marginBottom: 8,
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
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.3,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
});
