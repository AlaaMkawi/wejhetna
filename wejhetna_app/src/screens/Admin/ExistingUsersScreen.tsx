// src/screens/Admin/ExistingUsersScreen.tsx

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
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";

const API_BASE_URL = "http://10.0.2.2:8000";

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

type Props = NativeStackScreenProps<RootStackParamList, "ExistingUsers">;

type UserRoleFilter = "ALL" | "REGULAR" | "BUSINESS_OWNER" | "DRIVER";

export default function ExistingUsersScreen({ route}: Props) {
  const { adminUserId} = route.params;

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
        // Filter out rejected users - only show ACTIVE and PENDING
        const filteredUsers = json.filter((user: UserListItem) => 
          user.status !== "REJECTED"
        );
        setUsers(filteredUsers);
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return "#4CAF50";
      case "PENDING":
        return "#FFA500";
      case "REJECTED":
        return "#F44336";
      default:
        return "#757575";
    }
  };

  const renderItem = ({ item }: { item: UserListItem }) => (
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

        <View style={styles.metaRow}>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + "20", borderColor: getStatusColor(item.status) }]}>
            <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
              {item.status}
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
            {item.role === "BUSINESS_OWNER" ? "Remove" : "Delete"}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={styles.loadingText}>Loading users...</Text>
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
            {search ? "No users found matching your search." : "No users found."}
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
  deleteButton: {
    backgroundColor: "#EF4444",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 16,
    alignItems: "center",
    marginTop: 16,
    shadowColor: "#EF4444",
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
  },
});


