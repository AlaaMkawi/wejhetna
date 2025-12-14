// src/screens/AdminDriversScreen.tsx
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Image,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";

const API_BASE_URL = "http://10.0.2.2:8000";

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
};

type Props = NativeStackScreenProps<RootStackParamList, "AdminDrivers">;

export default function AdminDriversScreen({ route, navigation }: Props) {
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
        setError(json.detail || "Failed to load drivers");
      } else {
        setDrivers(json);
      }
    } catch (e: any) {
      setError("Network error: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPending();
  }, []);

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

  const renderItem = ({ item }: { item: DriverApplication }) => {
    const previewImage = item.car_photos_urls && item.car_photos_urls.length > 0
      ? item.car_photos_urls[0]
      : item.car_license_image_url;

    return (
      <TouchableOpacity
        onPress={() => handleOpenDetails(item)}
        style={styles.card}
        activeOpacity={0.8}
      >
        {/* Image Preview */}
        {previewImage && (
          <View style={styles.imagePreviewContainer}>
            <Image source={{ uri: previewImage }} style={styles.cardImage} />
            {item.car_photos_urls && item.car_photos_urls.length > 1 && (
              <View style={styles.imageOverlay}>
                <View style={styles.badgeOverlay}>
                  <Text style={styles.badgeOverlayText}>
                    📷 +{item.car_photos_urls.length - 1}
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}

        <View style={styles.cardContent}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              <Text style={styles.cardTitle}>{item.full_name}</Text>
              <View style={styles.infoRow}>
                <Text style={styles.infoIcon}>📧</Text>
                <Text style={styles.infoValue} numberOfLines={1}>{item.email}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoIcon}>📞</Text>
                <Text style={styles.infoValue}>{item.phone}</Text>
              </View>
            </View>
            <View style={[
              styles.statusBadge,
              item.driver_status === "PENDING" && styles.statusBadgePending,
              item.driver_status === "APPROVED" && styles.statusBadgeApproved,
              item.driver_status === "REJECTED" && styles.statusBadgeRejected,
            ]}>
              <Text style={styles.statusText}>{item.driver_status}</Text>
            </View>
          </View>

          <View style={styles.cardBody}>
            <View style={styles.carInfo}>
              <Text style={styles.carLabel}>🚗 {item.car_type}</Text>
              <Text style={styles.carDetails}>
                {item.plate_number} • {item.production_year}
              </Text>
            </View>

            <View style={styles.metaRow}>
              <View style={styles.metaBadge}>
                <Text style={styles.metaText}>
                  Driver: {item.driver_status} • Vehicle: {item.vehicle_status}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  const visibleDrivers = getVisibleDrivers();

  return (
    <View style={{ flex: 1 }}>
      {error && <Text style={[styles.error, { margin: 8 }]}>{error}</Text>}

      {/* Search + sort */}
      <View style={styles.filtersContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name..."
          placeholderTextColor="#94A3B8"
          value={search}
          onChangeText={setSearch}
        />

        <View style={styles.sortRow}>
          <Text style={styles.sortLabel}>Order:</Text>

          <TouchableOpacity
            style={[
              styles.sortButton,
              sortOrder === "oldest" && styles.sortButtonActive,
            ]}
            onPress={() => setSortOrder("oldest")}
          >
            <Text
              style={[
                styles.sortButtonText,
                sortOrder === "oldest" && styles.sortButtonTextActive,
              ]}
            >
              Oldest
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.sortButton,
              sortOrder === "newest" && styles.sortButtonActive,
            ]}
            onPress={() => setSortOrder("newest")}
          >
            <Text
              style={[
                styles.sortButtonText,
                sortOrder === "newest" && styles.sortButtonTextActive,
              ]}
            >
              Newest
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {visibleDrivers.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            {search ? "No drivers found matching your search." : "No pending drivers."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={visibleDrivers}
          keyExtractor={(item) => String(item.driver_profile_id)}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F5F7FA",
  },
  filtersContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    backgroundColor: "#FFFFFF",
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
    marginBottom: 12,
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
  sortRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sortLabel: {
    marginRight: 12,
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  sortButton: {
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
  sortButtonActive: {
    backgroundColor: "#6366F1",
    borderColor: "#6366F1",
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  sortButtonText: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  sortButtonTextActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    marginBottom: 16,
    overflow: "hidden",
    borderWidth: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  imagePreviewContainer: {
    width: "100%",
    height: 180,
    position: "relative",
    backgroundColor: "#F0F0F0",
  },
  cardImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  imageOverlay: {
    position: "absolute",
    top: 12,
    right: 12,
  },
  badgeOverlay: {
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  badgeOverlayText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
  },
  cardContent: {
    padding: 16,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  cardHeaderLeft: {
    flex: 1,
    marginRight: 12,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 10,
    letterSpacing: -0.5,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
    backgroundColor: "#F8F8F8",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  infoIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  infoValue: {
    fontSize: 13,
    color: "#333",
    fontWeight: "500",
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 2,
    minWidth: 90,
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
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: "#333",
  },
  cardBody: {
    marginTop: 8,
  },
  carInfo: {
    backgroundColor: "#F8F8F8",
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  carLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1B1338",
    marginBottom: 4,
  },
  carDetails: {
    fontSize: 13,
    color: "#666",
    fontWeight: "500",
  },
  metaRow: {
    flexDirection: "row",
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
  },
  metaBadge: {
    backgroundColor: "#E3F2FD",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  metaText: {
    fontSize: 11,
    color: "#1976D2",
    fontWeight: "600",
  },
  error: {
    color: "red",
    textAlign: "center",
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
