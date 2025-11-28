import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Button,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  TextInput,
  
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";

const API_BASE_URL = "http://10.0.2.2:8000";

type Props = NativeStackScreenProps<RootStackParamList, "AdminDrivers">;

type DriverApplication = {
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

export default function AdminDriversScreen({ route }: Props) {
  const { adminUserId } = route.params;

  const [drivers, setDrivers] = useState<DriverApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // reasons per driver_profile_id
  const [reasons, setReasons] = useState<Record<number, string>>({});

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

  const handleApprove = async (driverProfileId: number) => {
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE_URL}/admin/drivers/${driverProfileId}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            admin_user_id: adminUserId,
            reason: reasons[driverProfileId] || null,
          }),
        }
      );
      const json = await res.json();
      if (!res.ok) {
        setError(json.detail || "Approve failed");
      } else {
        // reload list
        loadPending();
      }
    } catch (e: any) {
      setError("Network error: " + e.message);
    }
  };

  const handleReject = async (driverProfileId: number) => {
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE_URL}/admin/drivers/${driverProfileId}/reject`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            admin_user_id: adminUserId,
            reason: reasons[driverProfileId] || null,
          }),
        }
      );
      const json = await res.json();
      if (!res.ok) {
        setError(json.detail || "Reject failed");
      } else {
        loadPending();
      }
    } catch (e: any) {
      setError("Network error: " + e.message);
    }
  };

  const renderItem = ({ item }: { item: DriverApplication }) => {
    const reason = reasons[item.driver_profile_id] || "";

    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{item.full_name}</Text>
        <Text>{item.email}</Text>
        <Text>{item.phone}</Text>
        <Text style={styles.cardSubtitle}>
          Car: {item.car_type} • {item.plate_number} • {item.production_year}
        </Text>
        <Text>Status: driver {item.driver_status} / vehicle {item.vehicle_status}</Text>

        <Text style={styles.label}>Reject reason (optional):</Text>
        <TextInput
          style={styles.reasonInput}
          value={reason}
          onChangeText={(text) =>
            setReasons((prev) => ({ ...prev, [item.driver_profile_id]: text }))
          }
          placeholder="Reason for rejection..."
        />

        <View style={styles.buttonRow}>
          <Button title="Approve" onPress={() => handleApprove(item.driver_profile_id)} />
          <View style={{ width: 8 }} />
          <Button title="Reject" onPress={() => handleReject(item.driver_profile_id)} />
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {error && (
        <Text style={[styles.error, { margin: 8 }]}>{error}</Text>
      )}

      {drivers.length === 0 ? (
        <View style={styles.center}>
          <Text>No pending drivers.</Text>
        </View>
      ) : (
        <FlatList
          data={drivers}
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
  label: {
    marginTop: 8,
    marginBottom: 4,
    fontWeight: "600",
  },
  reasonInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    padding: 6,
    marginBottom: 8,
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  error: {
    color: "red",
    textAlign: "center",
  },
});
