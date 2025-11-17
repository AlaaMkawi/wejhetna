import React, { useEffect, useState } from "react";
import { 
  SafeAreaView, 
  Text, 
  FlatList, 
  ActivityIndicator, 
  View, 
  TextInput, 
  Button,
  Alert
} from "react-native";

import { API_BASE_URL } from "./config";

// טיפוס של עסק
type Business = {
  id: number;
  name: string;
  category?: string | null;
};

export default function App() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // שדות לטופס הוספת ביזנס
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("");

  // טעינת נתונים
  useEffect(() => {
    const fetchBusinesses = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/businesses`);
        if (!res.ok) {
          throw new Error("Failed to fetch businesses");
        }
        const data: Business[] = await res.json();
        setBusinesses(data);
      } catch (err: any) {
        setError(err.message || "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchBusinesses();
  }, []);

  const addBusiness = async () => {
    if (!newName.trim()) {
      Alert.alert("Validation", "Please enter a business name");
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/businesses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          category: newCategory,
          latitude: 31.251,   // זמני
          longitude: 34.791,  // זמני
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        Alert.alert("Error", data.detail || "Error adding business");
        return;
      }

      // הוספה לרשימה בלי רענון
      setBusinesses((prev) => [...prev, data]);

      // ניקוי שדות
      setNewName("");
      setNewCategory("");

    } catch (error) {
      console.error(error);
      Alert.alert("Network error");
    }
  };

  // מסך טעינה
  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
        <Text>Loading businesses...</Text>
      </SafeAreaView>
    );
  }

  // מסך שגיאה
  if (error) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text style={{ color: "red" }}>Error: {error}</Text>
      </SafeAreaView>
    );
  }

  // מסך ראשי
  return (
    <SafeAreaView style={{ flex: 1, padding: 16 }}>

      {/* כותרת */}
      <Text style={{ fontSize: 20, fontWeight: "bold", marginBottom: 12 }}>
        Add Business
      </Text>

      {/* טופס הוספה */}
      <View style={{ marginBottom: 20 }}>
        <TextInput
          placeholder="Business name"
          value={newName}
          onChangeText={setNewName}
          style={{
            borderWidth: 1,
            padding: 10,
            marginBottom: 10,
            borderRadius: 8,
            borderColor: "#aaa",
          }}
        />

        <TextInput
          placeholder="Category (optional)"
          value={newCategory}
          onChangeText={setNewCategory}
          style={{
            borderWidth: 1,
            padding: 10,
            marginBottom: 10,
            borderRadius: 8,
            borderColor: "#aaa",
          }}
        />

        <Button title="Add Business" onPress={addBusiness} />
      </View>

      {/* רשימת ביזנסים */}
      <Text style={{ fontSize: 20, fontWeight: "bold", marginBottom: 12 }}>
        Businesses List:
      </Text>

      {businesses.length === 0 ? (
        <Text>No businesses found</Text>
      ) : (
        <FlatList
          data={businesses}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <View
              style={{
                padding: 12,
                marginBottom: 8,
                borderWidth: 1,
                borderRadius: 8,
              }}
            >
              <Text style={{ fontWeight: "bold" }}>{item.name}</Text>
              <Text>{item.category ?? "No category"}</Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}
