// src/screens/Admin/RejectedUsersScreen.tsx

import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  TextInput,
  TouchableOpacity,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";

const API_BASE_URL = "http://10.0.2.2:8000";

export type RejectedUserListItem = {
  id: number;
  full_name: string;
  username: string;
  email: string;
  phone: string;
  role: string;
  status: string;
  rejection_reason: string | null;
  created_at: string;
};

type Props = NativeStackScreenProps<RootStackParamList, "RejectedUsers">;

type UserRoleFilter = "ALL" | "REGULAR" | "BUSINESS_OWNER" | "DRIVER";

export default function RejectedUsersScreen({ }: Props) {

  const [users, setUsers] = useState<RejectedUserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRoleFilter>("ALL");

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = roleFilter === "ALL"
        ? `${API_BASE_URL}/admin/users`
        : `${API_BASE_URL}/admin/users?role_filter=${roleFilter}`;
      
      const res = await fetch(url);
      
      const responseText = await res.text();
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        console.error("Non-JSON response:", responseText.substring(0, 500));
        setError(`Server error: ${responseText.substring(0, 100)}...`);
        return;
      }
      
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
        // Filter to only show REJECTED users
        const rejectedUsers = json.filter((user: any) => user.status === "REJECTED");
        setUsers(rejectedUsers);
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

  const renderItem = ({ item }: { item: RejectedUserListItem }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Text style={styles.cardTitle}>{item.full_name}</Text>
          <Text style={styles.cardSubtitle}>@{item.username}</Text>
        </View>
        <View style={[styles.roleBadge, { backgroundColor: getRoleColor(item.role) + "20", borderColor: getRoleColor(item.role) }]}>
          <Text style={[styles.roleText, { color: getRoleColor(item.role) }]}>
            {item.role.replace("_", " ")}
          </Text>
        </View>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.infoRow}>
          <Text style={styles.infoIcon}>📧</Text>
          <Text style={styles.infoValue} numberOfLines={1}>{item.email}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoIcon}>📞</Text>
          <Text style={styles.infoValue}>{item.phone}</Text>
        </View>

        {/* Rejection Reason */}
        {item.rejection_reason && (
          <View style={styles.rejectionContainer}>
            <Text style={styles.rejectionLabel}>🚫 Rejection Reason:</Text>
            <Text style={styles.rejectionText}>{item.rejection_reason}</Text>
          </View>
        )}

        <View style={styles.metaRow}>
          <View style={[styles.statusBadge, styles.rejectedBadge]}>
            <Text style={[styles.statusText, { color: "#DC2626" }]}>
              REJECTED
            </Text>
          </View>
          <Text style={styles.dateText}>{formatDate(item.created_at)}</Text>
        </View>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={styles.loadingText}>Loading rejected users...</Text>
      </View>
    );
  }

  const visibleUsers = getVisibleUsers();

  return (
    <View style={styles.container}>
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, username, or email..."
          placeholderTextColor="#94A3B8"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Role Filter */}
      <View style={styles.filtersContainer}>
        <Text style={styles.filterLabel}>Filter by role:</Text>
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterButton, roleFilter === "ALL" && styles.filterButtonActive]}
            onPress={() => setRoleFilter("ALL")}
          >
            <Text style={[styles.filterButtonText, roleFilter === "ALL" && styles.filterButtonTextActive]}>
              All
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterButton, roleFilter === "REGULAR" && styles.filterButtonActive]}
            onPress={() => setRoleFilter("REGULAR")}
          >
            <Text style={[styles.filterButtonText, roleFilter === "REGULAR" && styles.filterButtonTextActive]}>
              Regular
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterButton, roleFilter === "BUSINESS_OWNER" && styles.filterButtonActive]}
            onPress={() => setRoleFilter("BUSINESS_OWNER")}
          >
            <Text style={[styles.filterButtonText, roleFilter === "BUSINESS_OWNER" && styles.filterButtonTextActive]}>
              Business
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterButton, roleFilter === "DRIVER" && styles.filterButtonActive]}
            onPress={() => setRoleFilter("DRIVER")}
          >
            <Text style={[styles.filterButtonText, roleFilter === "DRIVER" && styles.filterButtonTextActive]}>
              Driver
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {visibleUsers.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            {search ? "No rejected users found matching your search." : "No rejected users found."}
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
    backgroundColor: "#F5F7FA",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F5F7FA",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 15,
    color: "#64748B",
    fontWeight: "500",
  },
  errorContainer: {
    backgroundColor: "#FEF2F2",
    padding: 16,
    margin: 16,
    borderRadius: 16,
    borderLeftWidth: 4,
    borderLeftColor: "#EF4444",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  errorText: {
    color: "#DC2626",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
  },
  searchContainer: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  searchInput: {
    borderWidth: 0,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: "#F1F5F9",
    fontSize: 16,
    color: "#1E293B",
    fontWeight: "400",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  filtersContainer: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
    marginBottom: 12,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  filterRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  filterButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  filterButtonActive: {
    backgroundColor: "#6366F1",
    borderColor: "#6366F1",
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  filterButtonText: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  filterButtonTextActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  listContent: {
    padding: 20,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    borderWidth: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  cardHeaderLeft: {
    flex: 1,
    marginRight: 12,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  cardSubtitle: {
    fontSize: 14,
    color: "#64748B",
    fontWeight: "500",
    letterSpacing: 0.2,
  },
  roleBadge: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  roleText: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  cardBody: {
    marginTop: 4,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  infoIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  infoValue: {
    fontSize: 14,
    color: "#1E293B",
    fontWeight: "600",
    letterSpacing: 0.1,
  },
  rejectionContainer: {
    backgroundColor: "#FEF2F2",
    padding: 16,
    borderRadius: 16,
    marginTop: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#DC2626",
  },
  rejectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#DC2626",
    marginBottom: 8,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  rejectionText: {
    fontSize: 14,
    color: "#991B1B",
    fontWeight: "500",
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  statusBadge: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  rejectedBadge: {
    backgroundColor: "#FEF2F2",
    borderColor: "#DC2626",
  },
  statusText: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  dateText: {
    fontSize: 12,
    color: "#94A3B8",
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    color: "#94A3B8",
    textAlign: "center",
    fontWeight: "500",
    lineHeight: 24,
  },
});


