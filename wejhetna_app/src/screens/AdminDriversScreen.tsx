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
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";

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
  const { adminUserId } = route.params;

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

    // we don't have created_at, so oldest = original order, newest = reversed
    if (sortOrder === "newest") {
      list = [...list].reverse();
    }
    return list;
  };

  const handleOpenDetails = (driver: DriverApplication) => {
    navigation.navigate("AdminDriverDetails", {
      adminUserId,
      driver,
    });
  };

  const renderItem = ({ item }: { item: DriverApplication }) => (
    <TouchableOpacity
      onPress={() => handleOpenDetails(item)}
      style={styles.card}
      activeOpacity={0.8}
    >
      <Text style={styles.cardTitle}>{item.full_name}</Text>
      <Text>{item.email}</Text>
      <Text>{item.phone}</Text>
      <Text style={styles.cardSubtitle}>
        Car: {item.car_type} • {item.plate_number} • {item.production_year}
      </Text>
      <Text style={styles.statusText}>
        Status: driver {item.driver_status} / vehicle {item.vehicle_status}
      </Text>
      <Text style={styles.hint}>Tap to see full details</Text>
    </TouchableOpacity>
  );

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
        <View style={styles.center}>
          <Text>No pending drivers.</Text>
        </View>
      ) : (
        <FlatList
          data={visibleDrivers}
          keyExtractor={(item) => String(item.driver_profile_id)}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 12 }}
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
  },
  filtersContainer: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 4,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
    backgroundColor: "#fff",
  },
  sortRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  sortLabel: {
    marginRight: 8,
    fontWeight: "600",
  },
  sortButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ccc",
    marginRight: 8,
  },
  sortButtonActive: {
    backgroundColor: "#ED1C7B",
    borderColor: "#ED1C7B",
  },
  sortButtonText: {
    fontSize: 13,
    color: "#333",
  },
  sortButtonTextActive: {
    color: "#fff",
    fontWeight: "700",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "bold",
  },
  cardSubtitle: {
    marginTop: 4,
    marginBottom: 6,
    fontStyle: "italic",
  },
  statusText: {
    marginBottom: 4,
  },
  hint: {
    marginTop: 6,
    fontSize: 12,
    color: "#777",
  },
  error: {
    color: "red",
    textAlign: "center",
  },
});
