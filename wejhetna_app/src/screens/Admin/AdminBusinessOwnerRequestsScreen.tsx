// src/screens/Admin/AdminBusinessOwnerRequestsScreen.tsx
import React, { useEffect, useState } from "react";
import { BlurView } from "@react-native-community/blur";

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
  const { adminUserId, role } = route.params;

  const [requests, setRequests] = useState<BusinessOwnerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<"oldest" | "newest">("newest");

  const loadRequests = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/business-owner/requests`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.detail || "Failed to load business owner requests");
      } else {
        setRequests(json);
      }
    } catch (e: any) {
      setError("Network error: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const getVisibleRequests = () => {
    let list = requests.filter((req) => {
      const searchLower = search.toLowerCase();
      return (
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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
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

  const getStatusBadgeStyle = (status: string) => {
    return {
      backgroundColor: getStatusColor(status) + "20",
      borderColor: getStatusColor(status),
    };
  };

  const renderItem = ({ item }: { item: BusinessOwnerRequest }) => {
    const hasMainImage = item.main_image_url;
    const hasBusinessImages = item.business_images_urls && item.business_images_urls.length > 0;
    const hasLicense = item.business_license_image_url;
    const previewImage = hasMainImage 
      ? item.main_image_url 
      : (hasBusinessImages ? item.business_images_urls![0] : null);

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.8}
        onPress={() => {
          navigation.navigate("AdminBusinessOwnerRequestDetails", {
            adminUserId,
            role,
            request: item,
          });
        }}
      >
        {/* Image Preview Section */}
        {previewImage && (
          <View style={styles.imagePreviewContainer}>
            <Image source={{ uri: previewImage }} style={styles.cardImage} />
            <View style={styles.imageOverlay}>
              {hasLicense && (
                <View style={styles.badgeOverlay}>
                  <Text style={styles.badgeOverlayText}>📄 License</Text>
                </View>
              )}
              {hasBusinessImages && item.business_images_urls!.length > 1 && (
                <View style={styles.badgeOverlay}>
                  <Text style={styles.badgeOverlayText}>
                    📷 +{item.business_images_urls!.length - 1}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        <View style={styles.cardContent}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
              <View style={styles.nameRow}>
                {item.name_ar && (
                  <Text style={styles.nameText} numberOfLines={1}>
                    {item.name_ar}
                  </Text>
                )}
                {item.name_he && (
                  <Text style={styles.nameText} numberOfLines={1}>
                    {item.name_he}
                  </Text>
                )}
              </View>
            </View>
            <View style={[styles.statusBadge, getStatusBadgeStyle(item.status)]}>
              <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
                {item.status}
              </Text>
            </View>
          </View>

          <View style={styles.cardBody}>
            {item.phone && (
              <View style={styles.infoRow}>
                <Text style={styles.infoIcon}>📞</Text>
                <Text style={styles.infoValue}>{item.phone}</Text>
              </View>
            )}

            {item.description && (
              <Text style={styles.descriptionText} numberOfLines={2}>
                {item.description}
              </Text>
            )}

            <View style={styles.metaRow}>
              {item.existing_place_id ? (
                <View style={[styles.metaBadge, styles.claimBadge]}>
                  <Text style={styles.metaText}>📍 Claiming Place</Text>
                </View>
              ) : (
                <View style={[styles.metaBadge, styles.newBadge]}>
                  <Text style={styles.metaText}>➕ New Place</Text>
                </View>
              )}
              <Text style={styles.dateText}>{formatDate(item.created_at)}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#ED1C7B" />
        <Text style={styles.loadingText}>Loading requests...</Text>
      </View>
    );
  }

  const visibleRequests = getVisibleRequests();

  return (
    <View style={styles.container}>
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Search + sort */}
      <View style={styles.filtersContainer}>
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by business name..."
            placeholderTextColor="#94A3B8"
            value={search}
            onChangeText={setSearch}
          />
        </View>

        <View style={styles.sortRow}>
          <Text style={styles.sortLabel}>Sort by:</Text>
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
              Newest First
            </Text>
          </TouchableOpacity>

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
              Oldest First
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {visibleRequests.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            {search ? "No requests found matching your search." : "No business owner requests."}
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
  searchContainer: {
    marginBottom: 16,
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
  listContent: {
    padding: 20,
    paddingBottom: 100,
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
    flexDirection: "row",
    gap: 8,
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
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 2,
    minWidth: 80,
    alignItems: "center",
  },
  statusText: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  dateText: {
    fontSize: 11,
    color: "#999",
    fontWeight: "500",
    marginLeft: "auto",
  },
  cardBody: {
    marginTop: 8,
  },
  nameRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  nameText: {
    fontSize: 13,
    color: "#666",
    fontStyle: "italic",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    backgroundColor: "#F8F8F8",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  infoIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  infoValue: {
    fontSize: 14,
    color: "#333",
    fontWeight: "500",
  },
  descriptionText: {
    fontSize: 13,
    color: "#666",
    lineHeight: 18,
    marginTop: 8,
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
  },
  metaBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  claimBadge: {
    backgroundColor: "#FFF3E0",
  },
  newBadge: {
    backgroundColor: "#E8F5E9",
  },
  metaText: {
    fontSize: 11,
    fontWeight: "700",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    color: "#999",
    textAlign: "center",
  },
});

<BlurView
  style={styles.badgeOverlay}
  blurType="dark"
  blurAmount={10}
>
  <Text style={styles.badgeOverlayText}>Pending</Text>
</BlurView>